const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const JWT_SECRET = process.env.JWT_SECRET || "hubzone_super_secret_jwt_key_2026_empire";

// User Register
exports.registerController = async (req, res) => {
    try {
        const { name, username, email, password, phone, address, city, state, pin } = req.body;
        const displayName = (name || username || "").trim();

        if (!displayName || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name, email, password, and 10-digit mobile number are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if existing user by email
        const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email address already exists. Please log in."
            });
        }

        const encryptedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            `INSERT INTO users (username, email, password, phone, address, city, state, pin, role) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
            [
                displayName,
                normalizedEmail,
                encryptedPassword,
                phone.trim(),
                address ? address.trim() : null,
                city ? city.trim() : null,
                state ? state.trim() : null,
                pin ? pin.trim() : null
            ]
        );

        const newUser = {
            id: result.insertId,
            username: displayName,
            email: normalizedEmail,
            phone: phone.trim(),
            address: address ? address.trim() : null,
            city: city ? city.trim() : null,
            state: state ? state.trim() : null,
            pin: pin ? pin.trim() : null,
            role: "user"
        };

        const token = jwt.sign(
            { id: newUser.id, email: newUser.email, role: newUser.role },
            JWT_SECRET,
            { expiresIn: "30d" }
        );

        return res.status(201).json({
            success: true,
            message: "Registration successful!",
            user: newUser,
            token
        });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during registration.",
            error: error.message
        });
    }
};

// User / Admin Login (supports email OR phone number!)
exports.loginController = async (req, res) => {
    try {
        const { email, identifier, password } = req.body;
        const loginId = (identifier || email || "").trim().toLowerCase();

        if (!loginId || !password) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email/phone and password."
            });
        }

        // Query by email OR phone
        const [rows] = await pool.query(
            "SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1",
            [loginId, loginId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No account found with these details. Please register."
            });
        }

        const existingUser = rows[0];
        const isPasswordMatch = await bcrypt.compare(password, existingUser.password);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password. Please try again."
            });
        }

        const token = jwt.sign(
            { id: existingUser.id, email: existingUser.email, role: existingUser.role },
            JWT_SECRET,
            { expiresIn: "30d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            user: {
                id: existingUser.id,
                username: existingUser.username,
                email: existingUser.email,
                phone: existingUser.phone,
                address: existingUser.address,
                city: existingUser.city,
                state: existingUser.state,
                pin: existingUser.pin,
                role: existingUser.role
            },
            token
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during login.",
            error: error.message
        });
    }
};

// Get current profile
exports.getMyProfileController = async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, username, email, phone, address, city, state, pin, role, created_at FROM users WHERE email = ? LIMIT 1",
            [req.payload]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User profile not found."
            });
        }

        return res.status(200).json({
            success: true,
            user: rows[0]
        });
    } catch (error) {
        console.error("Get profile error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch profile.",
            error: error.message
        });
    }
};

// Update profile (user or admin)
exports.updateMyProfileController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { username, phone, address, city, state, pin, currentPassword, newPassword } = req.body;

        const [rows] = await pool.query("SELECT * FROM users WHERE email = ? LIMIT 1", [userEmail]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = rows[0];

        // If updating password
        let updatedPassword = user.password;
        if (newPassword && newPassword.trim().length > 0) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is required to set a new password."
                });
            }
            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) {
                return res.status(401).json({
                    success: false,
                    message: "Current password does not match."
                });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 6 characters."
                });
            }
            updatedPassword = await bcrypt.hash(newPassword, 10);
        }

        const newUsername = (username !== undefined && username !== null) ? username.trim() : user.username;
        const newPhone = (phone !== undefined && phone !== null) ? phone.trim() : user.phone;
        const newAddress = (address !== undefined && address !== null) ? address.trim() : user.address;
        const newCity = (city !== undefined && city !== null) ? city.trim() : user.city;
        const newState = (state !== undefined && state !== null) ? state.trim() : user.state;
        const newPin = (pin !== undefined && pin !== null) ? pin.trim() : user.pin;

        await pool.query(
            `UPDATE users 
             SET username = ?, phone = ?, address = ?, city = ?, state = ?, pin = ?, password = ?
             WHERE email = ?`,
            [newUsername, newPhone, newAddress, newCity, newState, newPin, updatedPassword, userEmail]
        );

        const [updatedRows] = await pool.query(
            "SELECT id, username, email, phone, address, city, state, pin, role, created_at FROM users WHERE email = ? LIMIT 1",
            [userEmail]
        );

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully!",
            user: updatedRows[0]
        });
    } catch (error) {
        console.error("Update profile error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update profile.",
            error: error.message
        });
    }
};

// Admin: Get all users
exports.getAllUsersController = async (req, res) => {
    try {
        const [users] = await pool.query(
            "SELECT id, username, email, phone, address, city, state, pin, role, created_at FROM users ORDER BY id DESC"
        );

        return res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        console.error("Get all users error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch users list.",
            error: error.message
        });
    }
};

// Admin: Delete user
exports.deleteUserController = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = rows[0];
        if (user.role === "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin accounts cannot be deleted."
            });
        }

        await pool.query("DELETE FROM users WHERE id = ?", [id]);

        return res.status(200).json({
            success: true,
            message: `User ${user.username} (${user.email}) deleted successfully.`
        });
    } catch (error) {
        console.error("Delete user error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete user.",
            error: error.message
        });
    }
};

