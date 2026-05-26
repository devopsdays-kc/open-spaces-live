import { useMemo, useState } from 'react';
import {
	DndContext,
	PointerSensor,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { useStore } from '../lib/store.js';
import { endpoints } from '../lib/api.js';

export default function ScheduleBuilder() {
	const ideas = useStore((s) => s.ideas);
	const slots = useStore((s) => s.slots);
	const rooms = useStore((s) => s.rooms);
	const refreshSchedule = useStore((s) => s.refreshSchedule);
	const refreshIdeas = useStore((s) => s.refreshIdeas);

	const [conflict, setConflict] = useState(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
	);

	const cellsById = useMemo(() => {
		const map = new Map();
		for (const idea of ideas) {
			if (idea.slot_id && idea.room_id) {
				map.set(`${idea.slot_id}:${idea.room_id}`, idea);
			}
		}
		return map;
	}, [ideas]);

	const unassigned = useMemo(
		() => ideas.filter((i) => i.status !== 'merged' && i.status !== 'removed' && !i.slot_id).slice(0, 100),
		[ideas],
	);

	async function onDragEnd(event) {
		setConflict(null);
		const { active, over } = event;
		if (!over) return;
		const ideaId = active.id;
		const dropId = over.id;
		try {
			if (dropId === 'unassigned') {
				await endpoints.assign(ideaId, null, null);
			} else if (typeof dropId === 'string' && dropId.startsWith('cell:')) {
				const [, slot_id, room_id] = dropId.split(':');
				await endpoints.assign(ideaId, slot_id, room_id);
			} else {
				return;
			}
			refreshSchedule();
			refreshIdeas();
		} catch (err) {
			if (err.status === 409) {
				setConflict(`That cell is taken — drop somewhere else first.`);
			} else {
				alert(err.message || 'Assignment failed');
			}
		}
	}

	async function addSlot() {
		const start = prompt('Slot start time? (e.g. 10:00)');
		if (!start) return;
		const dur = parseInt(prompt('Duration in minutes?', '45') || '45', 10);
		try { await endpoints.createSlot(start, dur); } catch (e) { alert(e.message); }
	}
	async function addRoom() {
		const name = prompt('Room name?');
		if (!name) return;
		try { await endpoints.createRoom(name); } catch (e) { alert(e.message); }
	}
	async function removeSlot(id) {
		if (!confirm('Delete this timeslot?')) return;
		try { await endpoints.deleteSlot(id); } catch (e) { alert(e.message); }
	}
	async function removeRoom(id) {
		if (!confirm('Delete this room?')) return;
		try { await endpoints.deleteRoom(id); } catch (e) { alert(e.message); }
	}

	return (
		<div className="builder">
			<div className="builder-toolbar">
				<button type="button" onClick={addSlot}>+ Timeslot</button>
				<button type="button" onClick={addRoom}>+ Room</button>
				{conflict && <span className="conflict">{conflict}</span>}
			</div>

			<DndContext sensors={sensors} onDragEnd={onDragEnd}>
				<div className="builder-layout">
					<UnassignedColumn ideas={unassigned} />

					<div className="builder-grid-wrap">
						{(slots.length === 0 || rooms.length === 0) ? (
							<p className="empty">Add at least one room and one timeslot to start scheduling.</p>
						) : (
							<table className="builder-grid">
								<thead>
									<tr>
										<th></th>
										{rooms.map((r) => (
											<th key={r.id}>
												{r.name}
												<button type="button" className="x" onClick={() => removeRoom(r.id)}>×</button>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{slots.map((slot) => (
										<tr key={slot.id}>
											<th className="time-cell">
												{slot.start_time}
												<small>{slot.duration_minutes}m</small>
												<button type="button" className="x" onClick={() => removeSlot(slot.id)}>×</button>
											</th>
											{rooms.map((room) => {
												const idea = cellsById.get(`${slot.id}:${room.id}`);
												return (
													<DroppableCell key={room.id} id={`cell:${slot.id}:${room.id}`}>
														{idea ? <DraggableIdea idea={idea} compact /> : <span className="dash">drop here</span>}
													</DroppableCell>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>
			</DndContext>
		</div>
	);
}

function UnassignedColumn({ ideas }) {
	const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });
	return (
		<aside ref={setNodeRef} className={`builder-side ${isOver ? 'over' : ''}`}>
			<h3>Top unassigned</h3>
			{ideas.length === 0 && <p className="empty">All ideas placed!</p>}
			<ul className="idea-list">
				{ideas.map((idea) => (
					<li key={idea.id}>
						<DraggableIdea idea={idea} />
					</li>
				))}
			</ul>
		</aside>
	);
}

function DroppableCell({ id, children }) {
	const { setNodeRef, isOver } = useDroppable({ id });
	return (
		<td ref={setNodeRef} className={`drop-cell ${isOver ? 'over' : ''}`}>
			{children}
		</td>
	);
}

function DraggableIdea({ idea, compact }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: idea.id });
	return (
		<div
			ref={setNodeRef}
			{...listeners}
			{...attributes}
			className={`draggable-idea ${compact ? 'compact' : ''} ${isDragging ? 'dragging' : ''}`}
		>
			<strong>{idea.title}</strong>
			<span className="badge">{idea.vote_count}</span>
		</div>
	);
}
