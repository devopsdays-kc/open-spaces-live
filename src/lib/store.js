// Zustand store: single source of truth for ideas, schedule, session.
// Both REST responses and WS events feed the same setters.

import { create } from 'zustand';
import { endpoints } from './api.js';
import { connectWs } from './ws.js';

export const VISIBLE_STATUSES = new Set(['open', 'scheduled']);

function sortIdeas(arr) {
	return [...arr].sort((a, b) => {
		if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
		return (a.created_at || 0) - (b.created_at || 0);
	});
}

function upsert(arr, item, key = 'id') {
	const idx = arr.findIndex((x) => x[key] === item[key]);
	if (idx === -1) return [...arr, item];
	const next = arr.slice();
	next[idx] = { ...next[idx], ...item };
	return next;
}

function meToState(me) {
	return {
		attendeeId: me.attendee_id,
		role: me.role,
		user: me.user,
		conferenceName: me.conference_name || '',
		eventCodeSet: !!me.event_code_set,
		submissionsOpenAt: me.submissions_open_at ?? null,
		submissionsCloseAt: me.submissions_close_at ?? null,
	};
}

export const useStore = create((set, get) => ({
	ready: false,
	attendeeId: null,
	role: 'attendee',
	user: null,
	conferenceName: '',
	eventCodeSet: false,
	submissionsOpenAt: null,
	submissionsCloseAt: null,

	ideas: [],
	slots: [],
	rooms: [],
	sessions: [],
	wsStatus: 'idle',

	async bootstrap() {
		const [me, ideas, schedule] = await Promise.all([
			endpoints.me(),
			endpoints.ideas(),
			endpoints.schedule(),
		]);
		set({
			ready: true,
			...meToState(me),
			ideas: sortIdeas(ideas),
			slots: schedule.slots,
			rooms: schedule.rooms,
			sessions: schedule.sessions,
		});
	},

	async refreshMe() {
		const me = await endpoints.me();
		set(meToState(me));
	},

	async refreshIdeas() {
		const ideas = await endpoints.ideas();
		set({ ideas: sortIdeas(ideas) });
	},

	async refreshSchedule() {
		const schedule = await endpoints.schedule();
		set({ slots: schedule.slots, rooms: schedule.rooms, sessions: schedule.sessions });
	},

	applyIdeaPatch(patch) {
		set((state) => {
			const my = state.ideas.find((i) => i.id === patch.id)?.my_vote ?? false;
			const merged = { my_vote: my, ...patch };
			const next = upsert(state.ideas, merged);
			return { ideas: sortIdeas(next.filter((i) => i.status !== 'merged' && i.status !== 'removed')) };
		});
	},

	dispatchWs(event) {
		switch (event.type) {
			case 'idea:added':
			case 'idea:updated':
				get().applyIdeaPatch(event.idea);
				break;
			case 'idea:assigned':
				get().applyIdeaPatch(event.idea);
				get().refreshSchedule();
				break;
			case 'idea:merged':
				get().refreshIdeas();
				break;
			case 'idea:removed':
				set((s) => ({ ideas: s.ideas.filter((i) => i.id !== event.id) }));
				break;
			case 'slot:changed':
			case 'slot:removed':
			case 'room:changed':
			case 'room:removed':
				get().refreshSchedule();
				break;
			case 'conference:renamed':
				set({ conferenceName: event.name });
				break;
			case 'conference:submissions_window_changed':
				set({ submissionsOpenAt: event.open_at ?? null, submissionsCloseAt: event.close_at ?? null });
				break;
			case 'conference:votes_reset':
				get().refreshIdeas();
				break;
			case 'conference:reset':
				set({ ideas: [], slots: [], rooms: [], sessions: [], submissionsOpenAt: null, submissionsCloseAt: null });
				break;
			default:
				break;
		}
	},

	connectLive() {
		const dispose = connectWs(
			(event) => get().dispatchWs(event),
			async (status) => {
				set({ wsStatus: status });
				if (status === 'open') {
					const [ideas, schedule] = await Promise.all([endpoints.ideas(), endpoints.schedule()]);
					set({ ideas: sortIdeas(ideas), slots: schedule.slots, rooms: schedule.rooms, sessions: schedule.sessions });
				}
			},
		);
		return dispose;
	},

	optimisticVote(id, delta) {
		set((state) => ({
			ideas: sortIdeas(
				state.ideas.map((i) =>
					i.id === id
						? {
								...i,
								vote_count: Math.max(0, i.vote_count + (delta > 0 ? 1 : -1)),
								my_vote: delta > 0,
						  }
						: i,
				),
			),
		}));
	},
}));
