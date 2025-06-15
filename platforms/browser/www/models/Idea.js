// models/Idea.js
const mongoose = require('mongoose');

const IdeaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  idea: { type: String, required: true },
  roadmap: { type: String, required: true },
  dateCreated: { type: Date, default: Date.now }
});

const Idea = mongoose.model('Idea', IdeaSchema);
module.exports = Idea;
