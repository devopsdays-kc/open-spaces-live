import React, { useState, useEffect, useCallback } from 'react';
import AdminDashboard from './AdminDashboard';

function Modal({ children, onClose }) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<button className="modal-close" onClick={onClose}>
					&times;
				</button>
				{children}
			</div>
		</div>
	);
}

function IdeaManager({ ideas, slots, rooms, fetchIdeas }) {
	const [ideaError, setIdeaError] = useState(null);
	const [selectedIdeas, setSelectedIdeas] = useState(new Set());
	const [showMergeModal, setShowMergeModal] = useState(false);
	const [mergeTitle, setMergeTitle] = useState('');
	const [mergeDescription, setMergeDescription] = useState('');
	const [showAssignModal, setShowAssignModal] = useState(false);
	const [assignIdea, setAssignIdea] = useState(null);
	const [assignSlotId, setAssignSlotId] = useState('');
	const [assignRoomId, setAssignRoomId] = useState('');

	// Create lookup maps for slots and rooms for efficient rendering
	const slotsMap = new Map(slots.map(slot => [slot.id, slot]));
	const roomsMap = new Map(rooms.map(room => [room.id, room]));

	const handleDeleteIdea = async (ideaId) => {
		if (window.confirm('Are you sure you want to delete this idea? This action cannot be undone.')) {
			try {
				const response = await fetch(`/api/ideas/${ideaId}`, { method: 'DELETE' });
				if (response.ok) {
					fetchIdeas(); // Refresh the list of ideas
				} else {
					const data = await response.json();
					setIdeaError(data.error || 'Failed to delete idea.');
				}
			} catch (error) {
				console.error('Error deleting idea:', error);
				setIdeaError('An unexpected error occurred while deleting the idea.');
			}
		}
	};

	const handleIdeaSelection = (ideaId) => {
		const newSelection = new Set(selectedIdeas);
		if (newSelection.has(ideaId)) {
			newSelection.delete(ideaId);
		} else {
			newSelection.add(ideaId);
		}
		setSelectedIdeas(newSelection);
	};

	const handleMergeSubmit = async (e) => {
		e.preventDefault();
		setIdeaError(null);

		try {
			const response = await fetch('/api/ideas/merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ideaIds: [...selectedIdeas],
					newTitle: mergeTitle,
					newDescription: mergeDescription,
				}),
			});

			if (response.ok) {
				setShowMergeModal(false);
				setSelectedIdeas(new Set());
				setMergeTitle('');
				setMergeDescription('');
				fetchIdeas();
			} else {
				const data = await response.json();
				setIdeaError(data.error || 'Failed to merge ideas.');
			}
		} catch (error) {
			console.error('Error merging ideas:', error);
			setIdeaError('An unexpected error occurred while merging ideas.');
		}
	};

	const openAssignModal = (idea) => {
		setAssignIdea(idea);
		setAssignSlotId(idea.slotId || '');
		setAssignRoomId(idea.roomId || '');
		setShowAssignModal(true);
	};

	const handleAssignSubmit = async (e) => {
		e.preventDefault();
		setIdeaError(null);

		try {
			const response = await fetch(`/api/ideas/${assignIdea.id}/assign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slotId: assignSlotId,
					roomId: assignRoomId,
				}),
			});

			if (response.ok) {
				setShowAssignModal(false);
				fetchIdeas();
			} else {
				const data = await response.json();
				setIdeaError(data.error || 'Failed to assign idea.');
			}
		} catch (error) {
			console.error('Error assigning idea:', error);
			setIdeaError('An unexpected error occurred while assigning the idea.');
		}
	};

	return (
		<div className="card idea-manager">
			<h3>Manage Ideas</h3>
			{selectedIdeas.size > 1 && (
				<button type="button" onClick={() => setShowMergeModal(true)} className="merge-button">Merge Selected ({selectedIdeas.size})</button>
			)}
			{ideaError && <p className="error-message">{ideaError}</p>}
			<div className="idea-list">
				{ideas.length === 0 && <p>No ideas submitted yet.</p>}
				<ul>
					{ideas.filter(idea => idea.status === 'active').map((idea) => (
						<li key={idea.id} className={selectedIdeas.has(idea.id) ? 'selected' : ''}>
							<div className="idea-selection">
								<input
									type="checkbox"
									checked={selectedIdeas.has(idea.id)}
									onChange={() => handleIdeaSelection(idea.id)}
								/>
							</div>
							<div className="idea-info">
								<strong>{idea.title}</strong> (Votes: {idea.votes})
								<p>{idea.description}</p>
								{idea.slotId && idea.roomId && (
									<div className="assignment-info">
										Scheduled for: <strong>{slotsMap.get(idea.slotId)?.start_time}</strong> in <strong>{roomsMap.get(idea.roomId)?.name}</strong>
									</div>
								)}
							</div>
							<div className="idea-actions">
								<button type="button" onClick={() => openAssignModal(idea)} className="assign-button">
									{idea.slotId ? 'Re-assign' : 'Assign'}
								</button>
								<button type="button" onClick={() => handleDeleteIdea(idea.id)} className="delete-button">Delete</button>
							</div>
						</li>
					))}
				</ul>
			</div>

			{showMergeModal && (
				<Modal onClose={() => setShowMergeModal(false)}>
					<h2>Merge Ideas</h2>
					<form onSubmit={handleMergeSubmit}>
						<div className="form-field">
							<label htmlFor="merge_title">New Title</label>
							<input
								id="merge_title"
								type="text"
								value={mergeTitle}
								onChange={(e) => setMergeTitle(e.target.value)}
								required
							/>
						</div>
						<div className="form-field">
							<label htmlFor="merge_description">New Description</label>
							<textarea
								id="merge_description"
								value={mergeDescription}
								onChange={(e) => setMergeDescription(e.target.value)}
								required
							/>
						</div>
						<button type="submit">Confirm Merge</button>
					</form>
				</Modal>
			)}

			{showAssignModal && assignIdea && (
				<Modal onClose={() => setShowAssignModal(false)}>
					<h2>Assign Idea</h2>
					<p><strong>{assignIdea.title}</strong></p>
					<form onSubmit={handleAssignSubmit}>
						<div className="form-field">
							<label htmlFor="assign_slot">Time Slot</label>
							<select id="assign_slot" value={assignSlotId} onChange={(e) => setAssignSlotId(e.target.value)} required>
								<option value="" disabled>Select a slot</option>
								{slots.map(slot => (
									<option key={slot.id} value={slot.id}>{slot.start_time} ({slot.duration_minutes} mins)</option>
								))}
							</select>
						</div>
						<div className="form-field">
							<label htmlFor="assign_room">Room</label>
							<select id="assign_room" value={assignRoomId} onChange={(e) => setAssignRoomId(e.target.value)} required>
								<option value="" disabled>Select a room</option>
								{rooms.map(room => (
									<option key={room.id} value={room.id}>{room.name}</option>
								))}
							</select>
						</div>
						<button type="submit">Confirm Assignment</button>
					</form>
				</Modal>
			)}
		</div>
	)
}


function Dashboard({ user }) {
	const [activeTab, setActiveTab] = useState('ideas'); // 'ideas', 'slots', 'rooms', 'users'

	// All the state and logic for the different managers will remain here for now
	// but we could refactor them into separate components later if needed.
	const [slots, setSlots] = useState([]);
	const [startTime, setStartTime] = useState('');
	const [duration, setDuration] = useState('30'); // Default to 30 minutes
	const [customDuration, setCustomDuration] = useState('');
	const [slotRoomId, setSlotRoomId] = useState('');
	const [error, setError] = useState(null);

	const [rooms, setRooms] = useState([]);
	const [newRoomName, setNewRoomName] = useState('');
	const [roomError, setRoomError] = useState(null);
	const [showAddRoomModal, setShowAddRoomModal] = useState(false);
	const [showAssignRoomModal, setShowAssignRoomModal] = useState(false);
	const [selectedSlot, setSelectedSlot] = useState(null);

	const [ideas, setIdeas] = useState([]);
	const [ideaError, setIdeaError] = useState(null);
	const [selectedIdeas, setSelectedIdeas] = useState(new Set());
	const [showMergeModal, setShowMergeModal] = useState(false);
	const [mergeTitle, setMergeTitle] = useState('');
	const [mergeDescription, setMergeDescription] = useState('');
	const [showAssignModal, setShowAssignModal] = useState(false);
	const [assignIdea, setAssignIdea] = useState(null);
	const [assignSlotId, setAssignSlotId] = useState('');
	const [assignRoomId, setAssignRoomId] = useState('');


	const fetchSlots = useCallback(async () => {
		try {
			const response = await fetch('/api/slots');
			if (response.ok) {
				const data = await response.json();
				setSlots(data);
			} else {
				alert('Failed to fetch slots.');
			}
		} catch (error) {
			console.error('Error fetching slots:', error);
			alert('An error occurred while fetching slots.');
		}
	}, []);

	const fetchRooms = useCallback(async () => {
		try {
			const response = await fetch('/api/rooms');
			if (response.ok) {
				const data = await response.json();
				setRooms(data);
			} else {
				alert('Failed to fetch rooms.');
			}
		} catch (error) {
			console.error('Error fetching rooms:', error);
			alert('An error occurred while fetching rooms.');
		}
	}, []);

	const fetchIdeas = useCallback(async () => {
		try {
			const response = await fetch('/api/ideas');
			if (response.ok) {
				const data = await response.json();
				setIdeas(data);
			} else {
				alert('Failed to fetch ideas.');
			}
		} catch (error) {
			console.error('Error fetching ideas:', error);
			alert('An error occurred while fetching ideas.');
		}
	}, []);

	useEffect(() => {
		fetchSlots();
		fetchRooms();
		fetchIdeas();
	}, [fetchSlots, fetchRooms, fetchIdeas]);

	const handleAddSlot = async (e) => {
		e.preventDefault();
		setError(null); // Clear previous errors
		const durationMinutes = duration === 'custom' ? parseInt(customDuration, 10) : parseInt(duration, 10);
		if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
			setError('Please enter a valid positive number for the duration.');
			return;
		}
		if (!slotRoomId) {
			setError('Please select a room for the time slot.');
			return;
		}

		try {
			const response = await fetch('/api/slots', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					start_time: startTime,
					duration_minutes: durationMinutes,
					roomId: slotRoomId
				}),
			});

			if (response.ok) {
				setStartTime('');
				setDuration('30'); // Reset duration to default
				setCustomDuration(''); // Clear custom duration
				setSlotRoomId('');
				fetchSlots();
			} else {
				const data = await response.json();
				setError(data.error || 'Failed to add slot.');
			}
		} catch (err) {
			console.error('Error adding slot:', err);
			setError('An unexpected error occurred. Please try again.');
		}
	};

	const handleDeleteSlot = async (slotId) => {
		if (window.confirm('Are you sure you want to delete this time slot?')) {
			try {
				const response = await fetch(`/api/slots/${slotId}`, { method: 'DELETE' });
				if (response.ok) {
					fetchSlots();
				} else {
					alert('Failed to delete slot.');
				}
			} catch (error) {
				console.error('Error deleting slot:', error);
				alert('An error occurred while deleting the slot.');
			}
		}
	};

	const handleAddRoom = async (e) => {
		e.preventDefault();
		setRoomError(null);
		if (!newRoomName) {
			setRoomError('Room name cannot be empty.');
			return;
		}

		try {
			const response = await fetch('/api/rooms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newRoomName }),
			});

			if (response.ok) {
				setNewRoomName('');
				fetchRooms();
				setShowAddRoomModal(false); // Close modal on success
			} else {
				const data = await response.json();
				setRoomError(data.error || 'Failed to add room.');
			}
		} catch (err) {
			console.error('Error adding room:', err);
			setRoomError('An unexpected error occurred. Please try again.');
		}
	};

	const handleDeleteRoom = async (roomId) => {
		if (window.confirm('Are you sure you want to delete this room?')) {
			try {
				const response = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
				if (response.ok) {
					fetchRooms();
				} else {
					alert('Failed to delete room.');
				}
			} catch (error) {
				console.error('Error deleting room:', error);
				alert('An error occurred while deleting the room.');
			}
		}
	};

	const handleDeleteIdea = async (ideaId) => {
		if (window.confirm('Are you sure you want to delete this idea? This action cannot be undone.')) {
			try {
				const response = await fetch(`/api/ideas/${ideaId}`, { method: 'DELETE' });
				if (response.ok) {
					fetchIdeas(); // Refresh the list of ideas
				} else {
					const data = await response.json();
					setIdeaError(data.error || 'Failed to delete idea.');
				}
			} catch (error) {
				console.error('Error deleting idea:', error);
				setIdeaError('An unexpected error occurred while deleting the idea.');
			}
		}
	};

	const handleIdeaSelection = (ideaId) => {
		const newSelection = new Set(selectedIdeas);
		if (newSelection.has(ideaId)) {
			newSelection.delete(ideaId);
		} else {
			newSelection.add(ideaId);
		}
		setSelectedIdeas(newSelection);
	};

	const handleMergeSubmit = async (e) => {
		e.preventDefault();
		setIdeaError(null);

		try {
			const response = await fetch('/api/ideas/merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ideaIds: [...selectedIdeas],
					newTitle: mergeTitle,
					newDescription: mergeDescription,
				}),
			});

			if (response.ok) {
				setShowMergeModal(false);
				setSelectedIdeas(new Set());
				setMergeTitle('');
				setMergeDescription('');
				fetchIdeas();
			} else {
				const data = await response.json();
				setIdeaError(data.error || 'Failed to merge ideas.');
			}
		} catch (error) {
			console.error('Error merging ideas:', error);
			setIdeaError('An unexpected error occurred while merging ideas.');
		}
	};

	const openAssignModal = (idea) => {
		setAssignIdea(idea);
		setAssignSlotId(idea.slotId || '');
		setAssignRoomId(idea.roomId || '');
		setShowAssignModal(true);
	};

	const handleAssignSubmit = async (e) => {
		e.preventDefault();
		setIdeaError(null);

		try {
			const response = await fetch(`/api/ideas/${assignIdea.id}/assign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slotId: assignSlotId,
					roomId: assignRoomId,
				}),
			});

			if (response.ok) {
				setShowAssignModal(false);
				fetchIdeas();
			} else {
				const data = await response.json();
				setIdeaError(data.error || 'Failed to assign idea.');
			}
		} catch (error) {
			console.error('Error assigning idea:', error);
			setIdeaError('An unexpected error occurred while assigning the idea.');
		}
	};

	const handleAssignRoomSubmit = async (e) => {
		e.preventDefault();
		setError(null);

		if (!selectedSlot || !slotRoomId) {
			setError("Something went wrong. Please try again.");
			return;
		}

		try {
			const response = await fetch(`/api/slots/${selectedSlot.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ roomId: slotRoomId }),
			});

			if (response.ok) {
				setShowAssignRoomModal(false);
				setSelectedSlot(null);
				setSlotRoomId('');
				fetchSlots();
			} else {
				const data = await response.json();
				setError(data.error || 'Failed to assign room.');
			}
		} catch (err) {
			console.error('Error assigning room:', err);
			setError('An unexpected error occurred. Please try again.');
		}
	};

	const openAssignRoomModal = (slot) => {
		setSelectedSlot(slot);
		setShowAssignRoomModal(true);
	};

	return (
		<div className="dashboard">
			<h2>Dashboard</h2>

			<div className="dashboard-tabs">
				<button type="button" onClick={() => setActiveTab('ideas')} className={activeTab === 'ideas' ? 'active' : ''}>Manage Ideas</button>
				<button type="button" onClick={() => setActiveTab('slots')} className={activeTab === 'slots' ? 'active' : ''}>Manage Time Slots</button>
				<button type="button" onClick={() => setActiveTab('rooms')} className={activeTab === 'rooms' ? 'active' : ''}>Manage Rooms</button>
				{user && user.role === 'admin' && (
					<button type="button" onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'active' : ''}>Admin Controls</button>
				)}
			</div>

			<div className="dashboard-content">
				{activeTab === 'ideas' && (
					<IdeaManager ideas={ideas} slots={slots} rooms={rooms} fetchIdeas={fetchIdeas} />
				)}

				{activeTab === 'slots' && (
					<div className="card slot-manager">
						<h3>Manage Time Slots</h3>
						<form onSubmit={handleAddSlot} className="slot-form">
							<div className="form-field">
								<label htmlFor="start_time">Start Time</label>
								<input
									id="start_time"
									type="text"
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
									placeholder="e.g., 9:00 AM"
									required
								/>
								<small>Enter a time, like "9:00 AM" or "14:30".</small>
							</div>
							<div className="form-field">
								<label htmlFor="duration">Duration</label>
								<select id="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
									<option value="30">30 minutes</option>
									<option value="45">45 minutes</option>
									<option value="60">1 hour</option>
									<option value="custom">Custom</option>
								</select>
							</div>
							{duration === 'custom' && (
								<div className="form-field">
									<label htmlFor="custom_duration">Custom Duration (mins)</label>
									<input
										id="custom_duration"
										type="number"
										value={customDuration}
										onChange={(e) => setCustomDuration(e.target.value)}
										placeholder="e.g., 75"
										required
									/>
								</div>
							)}
							<div className="form-field">
								<label htmlFor="slot_room">Room</label>
								{rooms.length > 0 ? (
									<select id="slot_room" value={slotRoomId} onChange={(e) => setSlotRoomId(e.target.value)} required>
										<option value="" disabled>Select a room</option>
										{rooms.map(room => (
											<option key={room.id} value={room.id}>{room.name}</option>
										))}
									</select>
								) : (
									<button type="button" onClick={() => setShowAddRoomModal(true)}>Add a Room First</button>
								)}
							</div>
							<button type="submit">Add Slot</button>
						</form>
						{error && <p className="error-message">{error}</p>}
						<div className="slot-list">
							<h4>Current Slots</h4>
							{slots.length === 0 && <p>No time slots defined yet.</p>}
							<ul>
								{slots.map((slot) => (
									<li key={slot.id}>
										<span>
											{slot.start_time} ({slot.duration_minutes} mins) -
											<strong>{slot.roomName ||
												<button type="button" onClick={() => openAssignRoomModal(slot)} className="link-button">
													Assign Room
												</button>
											}</strong>
										</span>
										<button type="button" onClick={() => handleDeleteSlot(slot.id)}>&times;</button>
									</li>
								))}
							</ul>
						</div>
					</div>
				)}

				{activeTab === 'rooms' && (
					<div className="card room-manager">
						<h3>Manage Rooms</h3>
						<form onSubmit={handleAddRoom} className="room-form">
							<div className="form-field">
								<label htmlFor="room_name">Room Name</label>
								<input
									id="room_name"
									type="text"
									value={newRoomName}
									onChange={(e) => setNewRoomName(e.target.value)}
									placeholder="e.g., Main Stage"
									required
								/>
							</div>
							<button type="submit">Add Room</button>
						</form>
						{roomError && <p className="error-message">{roomError}</p>}
						<div className="room-list">
							<h4>Current Rooms</h4>
							{rooms.length === 0 && <p>No rooms defined yet.</p>}
							<ul>
								{rooms.map((room) => (
									<li key={room.id}>
										<span>{room.name}</span>
										<button type="button" onClick={() => handleDeleteRoom(room.id)}>&times;</button>
									</li>
								))}
							</ul>
						</div>
					</div>
				)}

				{activeTab === 'users' && user && user.role === 'admin' && <AdminDashboard />}
			</div>

			{showAssignRoomModal && selectedSlot && (
				<Modal onClose={() => setShowAssignRoomModal(false)}>
					<h3>Assign Room to Slot</h3>
					<p>{selectedSlot.start_time} ({selectedSlot.duration_minutes} mins)</p>
					<form onSubmit={handleAssignRoomSubmit}>
						<div className="form-field">
							<label htmlFor="assign_room_to_slot">Room</label>
							<select id="assign_room_to_slot" value={slotRoomId} onChange={(e) => setSlotRoomId(e.target.value)} required>
								<option value="" disabled>Select a room</option>
								{rooms.map(room => (
									<option key={room.id} value={room.id}>{room.name}</option>
								))}
							</select>
						</div>
						<button type="submit">Assign Room</button>
					</form>
				</Modal>
			)}

			{showAddRoomModal && (
				<Modal onClose={() => setShowAddRoomModal(false)}>
					<div className="card room-manager">
						<h3>Add New Room</h3>
						<form onSubmit={handleAddRoom} className="room-form">
							<div className="form-field">
								<label htmlFor="new_room_name">Room Name</label>
								<input
									id="new_room_name"
									type="text"
									value={newRoomName}
									onChange={(e) => setNewRoomName(e.target.value)}
									placeholder="e.g., Main Stage"
									required
								/>
							</div>
							<button type="submit">Add Room</button>
						</form>
						{roomError && <p className="error-message">{roomError}</p>}
					</div>
				</Modal>
			)}
		</div>
	);
}

export default Dashboard;
