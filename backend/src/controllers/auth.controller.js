const User = require('../models/User');
const Patient = require('../models/Patient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  try {
    const { username, email, password, role, healthCenterId, name, phone } = req.body;
    
    if (!username && !email) {
      return res.status(400).json({ success: false, message: 'Username or email is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const finalUsername = (username || email).trim();
    const finalEmail = email ? email.trim().toLowerCase() : null;

    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername },
        ...(finalEmail ? [{ email: finalEmail }] : [])
      ]
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this username or email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username: finalUsername,
      email: finalEmail,
      name: name ? name.trim() : null,
      phone: phone ? phone.trim() : null,
      password: hashedPassword,
      role,
      healthCenterId: role === 'HEALTH_WORKER' ? healthCenterId : null,
      patientId: null // Patient record is created later during health profile / intake
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        phone: user.phone,
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
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username and Password are required' });
    }

    const identifier = String(username).trim();
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: identifier.toLowerCase() }
      ]
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const tokenPayload = {
      userId: user._id,
      username: user.username,
      name: user.name,
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
        email: user.email,
        name: user.name,
        phone: user.phone,
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
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        healthCenterId: user.healthCenterId,
        patientId: user.patientId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    
    if (!currentPassword) {
      return res.status(400).json({ success: false, message: 'Current password is required' });
    }
    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'New password is required' });
    }
    if (!confirmPassword) {
      return res.status(400).json({ success: false, message: 'Confirm new password is required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation do not match' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, logout, getMe, changePassword };
