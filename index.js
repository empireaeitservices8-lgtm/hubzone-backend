const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('./config/db');

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const routes = require('./routes/allRoutes');

const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const server = express();

// CORS configuration: allow Next.js app on port 3000, 3001, etc.
server.use(
    cors({
        origin: true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Bypass-Tunnel-Reminder",
            "bypass-tunnel-reminder",
        ],
    })
);

server.use(express.json({ limit: '15mb' }));
server.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static uploads directory
server.use('/uploads', express.static(uploadDir));

// Also serve static frontend public products if accessed directly from backend
const publicProductsDir = path.join(__dirname, '..', 'hubzone', 'public', 'products');
if (fs.existsSync(publicProductsDir)) {
    server.use('/products', express.static(publicProductsDir));
} else {
    const fallbackPublic = path.join(__dirname, '..', 'public', 'products');
    if (fs.existsSync(fallbackPublic)) {
        server.use('/products', express.static(fallbackPublic));
    }
}

// Mount routes at both /api and root / for convenience
server.use('/api', routes);
server.use(routes);

server.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: "HubZone E-Commerce Backend API is running smoothly!",
        version: "1.0.0"
    });
});

// Error handling middleware
server.use((err, req, res, next) => {
    console.error("Backend error:", err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});

const PORT = parseInt(process.env.PORT, 10) || 5000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HubZone API Server running on port ${PORT}... Ready for frontend requests!`);
});

