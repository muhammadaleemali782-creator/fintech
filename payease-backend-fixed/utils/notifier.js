const Notification = require('../models/Notification');

// Global in-memory set of SSE client responses
const sseClients = new Set();

const registerClient = (res) => {
  sseClients.add(res);
};

const removeClient = (res) => {
  sseClients.delete(res);
};

const sendNotification = async ({ type, title, message, data = {} }) => {
  try {
    // 1. Save in DB
    const notif = await Notification.create({
      type,
      title,
      message,
      data,
      read: false
    });

    // 2. Broadcast via SSE to connected admin clients
    const payload = JSON.stringify({
      id: notif._id,
      type,
      title,
      message,
      data,
      createdAt: notif.createdAt
    });

    for (const client of sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        sseClients.delete(client);
      }
    }

    return notif;
  } catch (err) {
    console.error('Error broadcasting notification:', err.message);
  }
};

module.exports = {
  sseClients,
  registerClient,
  removeClient,
  sendNotification
};
