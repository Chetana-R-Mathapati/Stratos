const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

sgMail.setApiKey(functions.config().sendgrid.key);

exports.sendInvestorEmail = functions.https.onRequest(async (req, res) => {
  try {
    const {mentor, mentorEmail, userName, userEmail, idea, dateTime} = req.body;

    if (!mentor || !mentorEmail || !userName || !userEmail || !idea) {
      return res.status(400).send({error: "Missing required fields"});
    }

    const msg = {
      to: mentorEmail,
      from: "your_verified_sendgrid_email@example.com", // Your verified sender
      subject: `New connection request from ${userName}`,
      text: `
        Mentor: ${mentor}
        From: ${userName} <${userEmail}>
        Idea: ${idea}
        Sent at: ${dateTime}
      `,
    };

    await sgMail.send(msg);

    res.status(200).send({success: true, message: "Email sent"});
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({error: "Failed to send email"});
  }
});
