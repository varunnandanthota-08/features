const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  try {
    const { username, password, role, healthCenterId, patientId } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      password: hashedPassword,
      role,
      healthCenterId: role === 'HEALTH_WORKER' ? healthCenterId : null,
      patientId: role === 'PATIENT' ? patientId : null
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        username: user.username,
        role: user.role,
        healthCenterId: user.healthCenterId,
        patientId: user.patientId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const tokenPayload = {
      userId: user._id,
      role: user.role,
      healthCenterId: user.healthCenterId,
      patientId: user.patientId
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'fallback_secret_for_tests', { expiresIn: '1d' });

    res.status(200).json({
      success: true,
      token,
      data: {
        userId: user._id,
        username: user.username,
        role: user.role,
        healthCenterId: user.healthCenterId,
        patientId: user.patientId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const logout = (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        role: user.role,
        healthCenterId: user.healthCenterId,
        patientId: user.patientId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, logout, getMe };
