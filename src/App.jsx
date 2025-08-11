import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import VerifyLogin from './VerifyLogin';
import Dashboard from './Dashboard';
import ProtectedRoute from './ProtectedRoute';
import Schedule from './Schedule'; // Import the new component
import './App.css';

function Modal({ children, onClose }) {
	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<button type="button" className="modal-close" onClick={onClose}>
					&times;
				</button>
				{children}
			</div>
		</div>
	);
}

function Header({ user, onLogoutClick, onLoginClick }) {
	return (
		<header className="app-header">
			<span className="header-title">
				<Link to="/">Open Spaces Live</Link>
			</span>
			<div className="auth-section">
				<Link to="/schedule" className="header-link">Schedule</Link>
				{user && (user.role === 'facilitator' || user.role === 'admin') && (
					<Link to="/dashboard" className="header-link">Dashboard</Link>
				)}
				{user ? (
					<>
						<span>{user.email}</span>
						<button type="button" onClick={onLogoutClick}>Logout</button>
					</>
				) : (
					<button type="button" onClick={onLoginClick}>Login</button>
				)}
			</div>
		</header>
	);
}

function HomePage({ showLoginModal, setShowLoginModal, user }) {
	const navigate = useNavigate();
	const [ideas, setIdeas] = useState([]);
	const [newIdeaTitle, setNewIdeaTitle] = useState('');
	const [newIdeaDescription, setNewIdeaDescription] = useState('');
	const [email, setEmail] = useState('');
	const [message, setMessage] = useState('');
	// No longer need magicLink state
	// const [magicLink, setMagicLink] = useState('');

	const fetchIdeas = useCallback(async () => {
		try {
			const response = await fetch('/api/ideas');
			if (response.ok) {
				const data = await response.json();
				setIdeas(data);
			}
		} catch (error) {
			console.error('Failed to fetch ideas:', error);
		}
	}, []);

	useEffect(() => {
		fetchIdeas();
	}, [fetchIdeas, user]); // Re-fetch ideas when user state changes

	const handleLogin = async (e) => {
		e.preventDefault();
		setMessage('');
		// setMagicLink(''); // No longer needed
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'Something went wrong');
			setMessage(data.message);
			// The magic link is no longer returned or handled by the client.
			// The form will now just show the success message.
			setEmail(''); // Clear email field on success
		} catch (error) {
			setMessage(error.message);
		}
	};

	const handleLogout = async () => {
		await fetch('/api/auth/logout', { method: 'POST' });
		// onSessionUpdate(); // This was removed from App.jsx, so this line is removed.
		navigate('/');
	};

	const handleNewIdeaSubmit = async (e) => {
		e.preventDefault();
		try {
			const response = await fetch('/api/ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newIdeaTitle, description: newIdeaDescription }),
			});
			if (response.ok) {
				setNewIdeaTitle('');
				setNewIdeaDescription('');
				fetchIdeas(); // Refresh the list of ideas
			} else {
				const data = await response.json();
				alert(data.error || 'Failed to submit idea.');
			}
		} catch (error) {
			console.error('Failed to submit idea:', error);
			alert('An error occurred while submitting your idea.');
		}
	};

	const handleVote = async (ideaId) => {
		try {
			const response = await fetch(`/api/ideas/${ideaId}/vote`, { method: 'POST' });
			if (response.ok) {
				fetchIdeas(); // Refresh ideas to show new vote count
			} else {
				alert('Failed to vote.');
			}
		} catch (error) {
			console.error('Failed to vote:', error);
			alert('An error occurred while voting.');
		}
	};

	return (
		<>
			{showLoginModal && (
				<Modal onClose={() => setShowLoginModal(false)}>
					<h2>Login</h2>
					<p>Enter your email to receive a magic link.</p>
					<form onSubmit={handleLogin}>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="Enter your email"
							required
						/>
						<button type="submit">Send Magic Link</button>
					</form>
					{message && <p className="message">{message}</p>}
					{/* Remove the magic link display block */}
				</Modal>
			)}

			{/* The main content structure was incorrect, it should not be inside the fragment but rendered by the <App> Router */}
			<div className="main-title-section">
				<h1>Marketplace of Ideas</h1>
			</div>

			<div className="card new-idea-form">
				<h3>Got an Idea?</h3>
				<form onSubmit={handleNewIdeaSubmit}>
					<input
						type="text"
						value={newIdeaTitle}
						onChange={(e) => setNewIdeaTitle(e.target.value)}
						placeholder="What's your idea?"
						required
					/>
					<textarea
						value={newIdeaDescription}
						onChange={(e) => setNewIdeaDescription(e.target.value)}
						placeholder="Describe your idea in a bit more detail..."
						required
					></textarea>
					<button type="submit">Submit Idea</button>
				</form>
			</div>

			<div className="post-it-board">
				{ideas.filter(idea => idea.status === 'active').map((idea) => (
					<div key={idea.id} className={`post-it ${idea.slotId ? 'scheduled' : ''}`}>
						{idea.slotId && <div className="scheduled-badge">Scheduled</div>}
						<h3>{idea.title}</h3>
						<p>{idea.description}</p>
						<div className="post-it-footer">
							<span className="vote-count">Votes: {idea.votes}</span>
							<button type="button" onClick={() => handleVote(idea.id)} className="vote-button" disabled={idea.slotId}>
								Vote
							</button>
						</div>
					</div>
				))}
			</div>
		</>
	);
}

function App() {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const [showLoginModal, setShowLoginModal] = useState(false);
	const navigate = useNavigate();

	const checkSession = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/auth/me');
			if (response.ok) {
				const data = await response.json();
				setUser(data.user);
			} else {
				setUser(null);
			}
		} catch (error) {
			console.error('Failed to fetch user session:', error);
			setUser(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		checkSession();
	}, [checkSession]);

	const handleLogout = async () => {
		await fetch('/api/auth/logout', { method: 'POST' });
		setUser(null);
		navigate('/');
	};

	if (loading) return <div>Loading...</div>;

	return (
		<div className="app-container">
			<Header user={user} onLogoutClick={handleLogout} onLoginClick={() => setShowLoginModal(true)} />
			{/* The main app-main should be here, wrapping the routes */}
			<main className="app-main">
				<Routes>
					<Route path="/" element={<HomePage showLoginModal={showLoginModal} setShowLoginModal={setShowLoginModal} user={user} />} />
					<Route path="/schedule" element={<Schedule />} />
					<Route path="/verify-login" element={<VerifyLogin onLoginSuccess={checkSession} />} />
					<Route path="/login-failed" element={<div>Login Failed. Please try again.</div>} />
					<Route
						path="/dashboard"
						element={
							<ProtectedRoute user={user} allowedRoles={['facilitator', 'admin']}>
								<Dashboard user={user} />
							</ProtectedRoute>
						}
					/>
				</Routes>
			</main>
		</div>
	);
}

export default App;
