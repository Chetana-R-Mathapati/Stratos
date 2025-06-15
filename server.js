const express = require("express");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const cors = require("cors");
const http = require("http");
const socketio = require("socket.io");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const port = 3000;

// In-memory user store
const users = [];

// Store live streaming data
const liveStreams = new Map(); // room -> {username, lastLiveTime, isLive}

// Store verification codes with expiry
const verificationCodes = new Map(); // email -> {code, expiry}

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.static(path.join(__dirname)));
app.use(
    session({
        secret: process.env.SESSION_SECRET || "default_secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);
app.use(passport.initialize());
app.use(passport.session());

// Passport config
passport.use(
    new LocalStrategy((username, password, done) => {
        const user = users.find((u) => u.username === username);
        if (!user) return done(null, false);
        if (!bcrypt.compareSync(password, user.password)) return done(null, false);
        return done(null, user);
    })
);
passport.serializeUser((user, done) => done(null, user.username));
passport.deserializeUser((username, done) => {
    const user = users.find((u) => u.username === username);
    done(null, user);
});

// Validation functions
function validateUsername(username) {
    // Username should be 3-20 characters, alphanumeric with underscore allowed
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
}

function validatePassword(password) {
    // Password should be at least 8 characters, contain uppercase, lowercase, number, and special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Routes
app.post("/signup", async (req, res) => {
    try {
        const { username, password, email, role, securityQuestions } = req.body;

        // Input validation
        const errors = [];
        if (!username || !validateUsername(username)) {
            errors.push("Invalid username. Must be 3-20 characters, alphanumeric with underscore allowed.");
        }
        if (!password || !validatePassword(password)) {
            errors.push("Invalid password. Must be at least 8 characters with uppercase, lowercase, number, and special character.");
        }
        if (!email || !validateEmail(email)) {
            errors.push("Invalid email format.");
        }
        if (!role || !['user', 'mentor', 'investor'].includes(role)) {
            errors.push("Invalid role selected.");
        }
        if (!securityQuestions || securityQuestions.length !== 2 ||
            !securityQuestions[0].question || !securityQuestions[0].answer ||
            !securityQuestions[1].question || !securityQuestions[1].answer) {
            errors.push("Please provide both security questions and answers");
        }

        // Check if user exists
        if (users.find(u => u.username === username)) {
            errors.push("Username already exists");
        }
        if (users.find(u => u.email === email)) {
            errors.push("Email already registered");
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        // Create user with hashed password
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            username,
            password: hashedPassword,
            email,
            role,
            securityQuestions: securityQuestions.map(q => ({
                question: q.question,
                answer: q.answer
            })),
            createdAt: new Date(),
            lastLogin: null,
            loginAttempts: 0,
            isLocked: false
        };

        users.push(newUser);

        // Return success without sensitive data
        res.status(201).json({
            success: true,
            message: "Account created successfully",
            user: {
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user
        const user = users.find(u => u.username === username);

        // Check if user exists and account is not locked
        if (!user) {
            return res.status(401).json({ success: false, error: "Invalid credentials" });
        }

        // Check if account is locked
        if (user.isLocked) {
            const lockoutTime = 15 * 60 * 1000; // 15 minutes
            const timeSinceLock = Date.now() - user.lastLogin;

            if (timeSinceLock < lockoutTime) {
                const remainingTime = Math.ceil((lockoutTime - timeSinceLock) / 60000);
                return res.status(403).json({
                    success: false,
                    error: `Account is locked. Try again in ${remainingTime} minutes`
                });
            } else {
                // Reset lock if lockout period has passed
                user.isLocked = false;
                user.loginAttempts = 0;
            }
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            user.loginAttempts += 1;

            // Lock account after 5 failed attempts
            if (user.loginAttempts >= 5) {
                user.isLocked = true;
                user.lastLogin = Date.now();
                return res.status(403).json({
                    success: false,
                    error: "Account locked due to too many failed attempts. Try again in 15 minutes"
                });
            }

            return res.status(401).json({
                success: false,
                error: `Invalid credentials. ${5 - user.loginAttempts} attempts remaining`
            });
        }

        // Successful login
        user.loginAttempts = 0;
        user.isLocked = false;
        user.lastLogin = Date.now();

        // Create session
        req.session.userId = user.username;

        res.json({
            success: true,
            message: "Login successful",
            user: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

// Session check middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: "Authentication required" });
    }
    next();
};

// Protected route example
app.get("/user/profile", requireAuth, (req, res) => {
    const user = users.find(u => u.username === req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
        success: true,
        user: {
            username: user.username,
            email: user.email,
            role: user.role,
            lastLogin: user.lastLogin
        }
    });
});

// Logout route
app.post("/logout", requireAuth, (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: "Logged out successfully" });
});

// Roadmap Generator
app.post("/generate-roadmap", (req, res) => {
    const { name, email, idea } = req.body;
    if (!name || !email || !idea) {
        return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const lowerIdea = idea.toLowerCase();
    let steps;

    if (
        lowerIdea.includes("fitness") ||
        lowerIdea.includes("health") ||
        lowerIdea.includes("wellness")
    ) {
        steps = generateFitnessRoadmap();
    } else if (
        lowerIdea.includes("education") ||
        lowerIdea.includes("learning") ||
        lowerIdea.includes("school")
    ) {
        steps = generateEducationRoadmap();
    } else if (
        lowerIdea.includes("sustainability") ||
        lowerIdea.includes("eco") ||
        lowerIdea.includes("green")
    ) {
        steps = generateSustainabilityRoadmap();
    } else {
        steps = generateGeneralRoadmap();
    }

    res.json({ success: true, steps });
});

function generateFitnessRoadmap() {
    return [
        "Conduct market research to identify the target demographic",
        "Design MVP for fitness tracking",
        "Develop partnerships for beta testing",
        "Incorporate feedback",
        "Launch with influencers",
        "Optimize based on data",
        "Add premium features",
        "Scale through partnerships",
    ];
}

function generateEducationRoadmap() {
    return [
        "Conduct surveys",
        "Design MVP",
        "Test with educators",
        "Add personalization/gamification",
        "Pilot with institutions",
        "Refine product",
        "Launch freemium model",
        "Expand market",
    ];
}

function generateSustainabilityRoadmap() {
    return [
        "Research sustainability challenges",
        "Design eco-friendly MVP",
        "Find partners",
        "Run green campaigns",
        "Test with early adopters",
        "Measure impact",
        "Apply for funding",
        "Scale and expand",
    ];
}

function generateGeneralRoadmap() {
    return [
        "Validate problem-solution fit",
        "Build MVP",
        "Collect feedback",
        "Choose monetization strategy",
        "Launch on platforms",
        "Track metrics",
        "Seek investment",
        "Expand offerings",
    ];
}

// Helper function to format time ago
function getTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);

    let interval = seconds / 31536000; // years
    if (interval > 1) return Math.floor(interval) + ' years ago';

    interval = seconds / 2592000; // months
    if (interval > 1) return Math.floor(interval) + ' months ago';

    interval = seconds / 86400; // days
    if (interval > 1) return Math.floor(interval) + ' days ago';

    interval = seconds / 3600; // hours
    if (interval > 1) return Math.floor(interval) + ' hours ago';

    interval = seconds / 60; // minutes
    if (interval > 1) return Math.floor(interval) + ' minutes ago';

    if (seconds < 10) return 'just now';

    return Math.floor(seconds) + ' seconds ago';
}

// Socket.IO Chat
io.on("connection", (socket) => {
    socket.on("joinRoom", ({ username, room }) => {
        socket.join(room);
        socket.username = username;
        socket.room = room;

        // Send last live time to new user
        const roomData = liveStreams.get(room);
        if (roomData) {
            const timeAgo = getTimeAgo(roomData.lastLiveTime);
            socket.emit("lastLiveTime", {
                timestamp: roomData.lastLiveTime,
                timeAgo,
                streamer: roomData.username
            });
        }

        socket.to(room).emit("message", `${username} has joined the ${room} group.`);
        socket.emit("message", `Welcome to the ${room} group, ${username}!`);

        // Start periodic updates of "time ago" for all clients
        if (roomData && !roomData.isLive) {
            io.to(room).emit("updateTimeAgo", {
                timestamp: roomData.lastLiveTime,
                timeAgo: getTimeAgo(roomData.lastLiveTime),
                streamer: roomData.username
            });
        }
    });

    socket.on("startLive", ({ username, room }) => {
        const now = new Date().toISOString();
        liveStreams.set(room, {
            username,
            lastLiveTime: now,
            isLive: true
        });

        socket.to(room).emit("message", `${username} started a live stream!`);
    });

    socket.on("endLive", ({ username, room }) => {
        const roomData = liveStreams.get(room);
        if (roomData && roomData.username === username) {
            const now = new Date().toISOString();
            roomData.lastLiveTime = now;
            roomData.isLive = false;

            const timeAgo = getTimeAgo(now);
            io.to(room).emit("lastLiveTime", {
                timestamp: now,
                timeAgo,
                streamer: username
            });
            socket.to(room).emit("message", `${username} ended the live stream.`);
        }
    });

    socket.on("requestTimeUpdate", ({ room }) => {
        const roomData = liveStreams.get(room);
        if (roomData && !roomData.isLive) {
            socket.emit("updateTimeAgo", {
                timestamp: roomData.lastLiveTime,
                timeAgo: getTimeAgo(roomData.lastLiveTime),
                streamer: roomData.username
            });
        }
    });

    socket.on("chatMessage", (msg) => {
        const { room, username } = socket;
        if (room && username) {
            io.to(room).emit("chatMessage", { username, msg });
        }
    });

    socket.on("typing", () => {
        socket.to(socket.room).emit("typing", socket.username);
    });

    socket.on("disconnect", () => {
        if (socket.room && socket.username) {
            io.to(socket.room).emit("message", `${socket.username} left the group.`);
        }
    });
});

// Update "time ago" for all rooms every minute
setInterval(() => {
    for (const [room, data] of liveStreams.entries()) {
        if (!data.isLive) {
            io.to(room).emit("updateTimeAgo", {
                timestamp: data.lastLiveTime,
                timeAgo: getTimeAgo(data.lastLiveTime),
                streamer: data.username
            });
        }
    }
}, 60000); // Update every minute

// Generate random 6-digit code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Password reset endpoints
app.post("/send-verification", async (req, res) => {
    try {
        const { username } = req.body;

        // Validate username
        if (!username || !validateUsername(username)) {
            return res.status(400).json({ error: "Invalid username format" });
        }

        // Check if user exists
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(404).json({ error: "No account found with this username" });
        }

        // Generate and store verification code
        const code = generateVerificationCode();
        const expiry = Date.now() + (5 * 60 * 1000); // 5 minutes expiry
        verificationCodes.set(username, { code, expiry });

        // In a real application, send email with verification code to user's registered email
        console.log(`Verification code for ${username} (${user.email}): ${code}`);

        res.json({ success: true, message: "Verification code sent to your registered email" });
    } catch (error) {
        console.error('Send verification error:', error);
        res.status(500).json({ error: "Failed to send verification code" });
    }
});

app.post("/verify-code", (req, res) => {
    try {
        const { username, code } = req.body;

        const verification = verificationCodes.get(username);
        if (!verification) {
            return res.status(400).json({ error: "No verification code found" });
        }

        if (Date.now() > verification.expiry) {
            verificationCodes.delete(username);
            return res.status(400).json({ error: "Verification code expired" });
        }

        if (verification.code !== code) {
            return res.status(400).json({ error: "Invalid verification code" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({ error: "Failed to verify code" });
    }
});

app.post("/reset-password", async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log("Reset password request for username:", username);
        console.log("Current registered users:", users.map(u => u.username));

        // Validate password
        if (!validatePassword(password)) {
            return res.status(400).json({ error: "Invalid password format" });
        }

        // Find user
        const user = users.find(u => u.username === username);
        if (!user) {
            console.log("No user found with username:", username);
            return res.status(404).json({ error: `No account found with username: ${username}. Please make sure you have registered first.` });
        }

        console.log("User found, resetting password for:", username);

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;

        // Reset login attempts and unlock account
        user.loginAttempts = 0;
        user.isLocked = false;

        console.log("Password reset successful for:", username);
        res.json({ success: true, message: "Password reset successful" });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: "Failed to reset password" });
    }
});

app.post("/fetch-security-questions", (req, res) => {
    try {
        const { email } = req.body;

        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(404).json({ error: "No account found with this email" });
        }

        // Return questions without answers
        const questions = user.securityQuestions.map(q => ({
            question: q.question
        }));

        res.json({ success: true, questions });
    } catch (error) {
        console.error('Fetch security questions error:', error);
        res.status(500).json({ error: "Failed to fetch security questions" });
    }
});

app.post("/verify-security-answers", async (req, res) => {
    try {
        const { email, answers } = req.body;

        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Verify answers
        const isCorrect = user.securityQuestions.every((q, index) =>
            answers[index].toLowerCase() === q.answer.toLowerCase()
        );

        if (!isCorrect) {
            return res.status(400).json({ error: "Incorrect answers to security questions" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Verify security answers error:', error);
        res.status(500).json({ error: "Failed to verify security answers" });
    }
});

// Add a debug endpoint to check registered users
app.get("/debug/users", (req, res) => {
    // Only return non-sensitive information
    const safeUsers = users.map(user => ({
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
    }));
    res.json({ users: safeUsers });
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signin.html'));
});

app.get('/funds', (req, res) => {
    res.sendFile(path.join(__dirname, 'funds.html'));
});

app.get('/tax', (req, res) => {
    res.sendFile(path.join(__dirname, 'tax.html'));
});

// Add tax services routes
app.get('/tax.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'tax.html'));
});

app.get('/check-tax-access', (req, res) => {
    res.json({
        hasAccess: true,
        message: 'Access granted to tax services'
    });
});

// Appointment routes
app.post("/book-appointment", (req, res) => {
    try {
        const { investorId, date, purpose } = req.body;

        if (!req.session.userId) {
            return res.status(401).json({ success: false, error: "Please login first" });
        }

        // Store appointment and unlock tax services
        const appointment = {
            userId: req.session.userId,
            investorId,
            date,
            purpose,
            createdAt: new Date()
        };

        // In a real app, you would store this in a database
        // For now, we'll store it in the user object
        const user = users.find(u => u.username === req.session.userId);
        if (!user.appointments) user.appointments = [];
        user.appointments.push(appointment);

        // Unlock tax services for this user
        user.hasTaxAccess = true;

        res.json({
            success: true,
            message: "Appointment booked successfully",
            taxServicesUnlocked: true
        });

    } catch (error) {
        console.error('Book appointment error:', error);
        res.status(500).json({ success: false, error: "Failed to book appointment" });
    }
});

app.get("/check-tax-access", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: "Please login first" });
    }

    const user = users.find(u => u.username === req.session.userId);
    res.json({
        success: true,
        hasTaxAccess: user?.hasTaxAccess || false
    });
});
// After verifying Chetana's login (e.g., using Firebase Auth in your backend)

server.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
});