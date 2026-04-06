require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { connectDB, Asset, Playlist, Device, GlobalState } = require('./database_models');

const app = express();
const server = http.createServer(app);

connectDB();

app.use(cors());
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
    },
  }),
});

const seedDB = async () => {
  try {
    const stateCount = await GlobalState.countDocuments();
    if (stateCount === 0) {
      await GlobalState.create({
        tickerNews:
          'BREAKING: ANTIGRAVITY OS v2.5 DEPLOYED WITH MONGODB. • ALL EDGE NODES SYNCHRONIZED.',
        style: 'Neon',
        color: '#00e5ff',
        speed: 'Normal',
      });
    }
  } catch (e) {
    console.log('DB Seed Skipped (No connection)');
  }
};
seedDB();

const getActiveData = async () => {
  try {
    let thePlaylist = [];
    let theTicker = 'AWAITING BROADCAST...';

    const state = await GlobalState.findOne().sort({ createdAt: -1 });
    if (state) theTicker = state.tickerNews;

    const activeList = await Playlist.findOne({ isActive: true });
    if (activeList) {
      thePlaylist = activeList.items;
    } else {
      thePlaylist = [
        { id: 'fs1', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4', duration: 8000 },
        {
          id: 'fs2',
          type: 'image',
          url: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=3200',
          duration: 5000,
        },
      ];
    }
    return { playlist: thePlaylist, ticker: theTicker };
  } catch (e) {
    return {
      playlist: [
        {
          id: 'err1',
          type: 'image',
          url: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=3200',
          duration: 8000,
        },
      ],
      ticker: 'NETWORK UNSTABLE. RUNNING OFF CACHE.',
    };
  }
};

app.get('/api/assets', async (req, res) => {
  try {
    const assets = await Asset.find().sort({ createdAt: -1 });
    res.json(assets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileUrl = `http://localhost:3001/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

  try {
    const newAsset = await Asset.create({
      filename: req.file.filename,
      type: fileType,
      url: fileUrl,
      duration: 8000,
    });

    if (req.body.pushLive === 'true') {
      const newItem = {
        id: newAsset._id.toString(),
        assetId: newAsset._id,
        url: newAsset.url,
        type: newAsset.type,
        duration: newAsset.duration,
      };
      await Playlist.updateMany({}, { isActive: false });
      const livePlaylist = await Playlist.create({
        name: `Quick Cast ${new Date().toISOString()}`,
        items: [newItem],
        isActive: true,
      });
      io.emit('playlist_updated', livePlaylist.items);
      io.emit('force_sync', newItem);
    }
    res.json({ success: true, asset: newAsset });
  } catch (error) {
    res.status(500).json({ error: `Database error during upload: ${error.message}` });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (asset) {
      const filePath = path.join(__dirname, 'uploads', asset.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await Asset.deleteOne({ _id: req.params.id });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Asset not found' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tickers', async (req, res) => {
  try {
    const states = await GlobalState.find().sort({ createdAt: -1 }).limit(10);
    res.json(states);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ticker', async (req, res) => {
  const { text, priority, style, color, speed } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    const newState = await GlobalState.create({
      tickerNews: text,
      priority: priority || 'Normal',
      style: style || 'Classic',
      color: color || '#00e5ff',
      speed: speed || 'Normal',
    });
    io.emit('ticker_updated', text);
    res.json({ success: true, state: newState });
  } catch (error) {
    res.status(500).json({ error: 'DB Error saving ticker' });
  }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const playlists = await Playlist.find().sort({ updatedAt: -1 });
    res.json(playlists);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/playlists', async (req, res) => {
  try {
    const { name, items, isActive } = req.body;
    if (isActive) {
      await Playlist.updateMany({}, { isActive: false });
    }
    const newPlaylist = await Playlist.create({ name, items, isActive });
    if (isActive) {
      io.emit('playlist_updated', items);
    }
    res.json({ success: true, playlist: newPlaylist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/playlists/:id/activate', async (req, res) => {
  try {
    await Playlist.updateMany({}, { isActive: false });
    const pl = await Playlist.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    io.emit('playlist_updated', pl.items);
    res.json({ success: true, playlist: pl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    await Playlist.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeen: -1 });
    res.json(devices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/state', async (req, res) => {
  const data = await getActiveData();
  res.json(data);
});

io.on('connection', async (socket) => {
  console.log(`[Display Node Connected]: ${socket.id}`);

  try {
    await Device.findOneAndUpdate(
      { deviceId: socket.id },
      { name: `Display Node ${socket.id.substring(0, 6)}`, status: 'online', lastSeen: Date.now() },
      { upsert: true, new: true },
    );
  } catch (e) {}

  const initData = await getActiveData();
  socket.emit('playlist_updated', initData.playlist);
  socket.emit('ticker_updated', initData.ticker);

  socket.on('disconnect', async () => {
    console.log(`[Display Node Disconnected]: ${socket.id}`);
    try {
      await Device.findOneAndUpdate({ deviceId: socket.id }, { status: 'offline', lastSeen: Date.now() });
    } catch (e) {}
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`CMS Database-Backed Server running on http://localhost:${PORT}`);
});
