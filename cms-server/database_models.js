const mongoose = require('mongoose');

// --- DATABASE CONNECTION ---
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/signage_db');
        console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[Database Error] ${error.message}`);
        console.log(`[Database Fallback] To test locally without MongoDB, make sure MongoDB is running on port 27017 or provide a valid cluster URI in your .env file.`);
    }
};

// --- MODELS ---

// 1. Asset Model (Files Uploaded)
const assetSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    type: { type: String, enum: ['video', 'image', 'html'], required: true },
    url: { type: String, required: true },
    duration: { type: Number, default: 8000 }, 
    uploadedBy: { type: String, default: 'Admin' }
}, { timestamps: true });

const Asset = mongoose.model('Asset', assetSchema);

// 2. Playlist Model
const playlistSchema = new mongoose.Schema({
    name: { type: String, required: true },
    items: [{
        assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
        url: String, 
        type: String,
        duration: Number
    }],
    isActive: { type: Boolean, default: false }
}, { timestamps: true });

const Playlist = mongoose.model('Playlist', playlistSchema);

// 3. Device/Screen Model
const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['online', 'offline', 'error'], default: 'offline' },
    lastSeen: { type: Date, default: Date.now },
    currentPlaylist: { type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }
}, { timestamps: true });

const Device = mongoose.model('Device', deviceSchema);

// 4. Global State Model (For Ticker and Quick Casts)
const globalStateSchema = new mongoose.Schema({
    tickerNews: { type: String, default: "WELCOME TO ANTIGRAVITY OS." },
    priority: { type: String, default: "Normal" },
    style: { type: String, default: "Classic" },
    color: { type: String, default: "#00e5ff" },
    speed: { type: String, default: "Normal" },
    emergencyBroadcastActive: { type: Boolean, default: false }
}, { timestamps: true });

const GlobalState = mongoose.model('GlobalState', globalStateSchema);

module.exports = { connectDB, Asset, Playlist, Device, GlobalState };
