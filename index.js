const express = require("express");
const bodyParser = require("body-parser");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require("./gautham-courses-firebase-adminsdk-v0pqv-a0298caefe.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gautham-courses-default-rtdb.firebaseio.com",
});

const app = express();

app.use(bodyParser.json());

const razorpay = new Razorpay({
  key_id: "rzp_test_RPDCCNWs59cWCh",
  key_secret: "wO8wZfGyS4LvbJT9tSk55yjl",
});

// Replace 'YOUR_RAZORPAY_WEBHOOK_SECRET' with the actual webhook secret from your Razorpay account
const webhookSecret = "Vortex";

app.post("/payment", async (req, res) => {
  const body = req.body;
  console.log("Received payment data from frontend:", body);

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(JSON.stringify(body))
    .digest("hex");

  console.log("Expected Signature:", expectedSignature);
  console.log("Received Signature:", req.headers["x-razorpay-signature"]);

  if (req.headers["x-razorpay-signature"] === expectedSignature) {
    console.log("Signature verification successful");

    // Payment success data is in 'body' variable
    // const paymentData = body.payload.payment.entity; // This is line 35
    const paymentData = body;

    console.log("Payment success:", paymentData);

    const fakePastDate = new Date(); // Create a new date object
    fakePastDate.setDate(fakePastDate.getDate() - 35); // Subtract 35 days to simulate an old payment date

    const db = admin.firestore();
    const userDocRef = db.collection("users").doc("user"); // Replace with the actual document ID
    // const paymentDocRef = userDocRef.collection("payments").doc(); // Generates a new random document ID
    const paymentDataToStore = {
      paid: true,
      amount: paymentData.amount,
      PaymentId: paymentData.paymentId,
      Paymentdate: new Date(),
      // Paymentdate: fakePastDate,
    };

    try {
      await userDocRef.set(paymentDataToStore);
      console.log("Payment data stored in Firestore");

      await scheduleSubscriptionUpdate();
      return res.status(200).json({ status: "success" }); // Move the return statement here
    } catch (error) {
      console.error("Error storing payment data:", error);
      return res.status(500).json({ status: "error" }); // Move the return statement here
    }
  } else {
    console.log("Signature verification failed");
    return res.status(403).json({ status: "invalid signature" }); // Move the return statement here
  }
});

const scheduleSubscriptionUpdate = async () => {
  const db = admin.firestore();
  const usersCollection = db.collection("users");

  const snapshot = await usersCollection.get();

  snapshot.forEach(async (userDoc) => {
    const userData = userDoc.data();
    if (userData.paid && userData.Paymentdate) {
      const currentDate = new Date();
      const paymentDate = userData.Paymentdate.toDate();
      const daysSincePayment = Math.floor(
        (currentDate - paymentDate) / (1000 * 60 * 60 * 24)
      );

      if (daysSincePayment >= 28) {
        await userDoc.ref.update({
          paid: false,
          amount: null,
          PaymentId: null,
          Paymentdate: null,
          DaysLeft: null, // Clear DaysLeft field as well
        });
        console.log(`Subscription for user ${userDoc.id} has expired.`);
      } else {
        await userDoc.ref.update({ DaysLeft: 28 - daysSincePayment }); // Update DaysLeft field
      }
    }
  });

  console.log("Scheduler");
};

setInterval(scheduleSubscriptionUpdate, 24 * 60 * 60 * 1000); // Run every 24 hours

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
