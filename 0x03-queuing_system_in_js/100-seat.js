import express from 'express';
import redis from 'redis';

const express = require('express');
const { promisify } = require('util');
const redis = require('redis');
const kue = require('kue');

const app = express();
const port = 1245;

// Redis client
const redisClient = redis.createClient();

// Promisify Redis commands
const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);

// Initialize available seats
const initialAvailableSeats = 50;
let availableSeats = initialAvailableSeats;
let reservationEnabled = true;

// Kue queue
const queue = kue.createQueue();

// Reserve seat function
async function reserveSeat(number) {
  await setAsync('available_seats', number);
  availableSeats = number;
}

// Get current available seats function
async function getCurrentAvailableSeats() {
  const seats = await getAsync('available_seats');
  return seats ? parseInt(seats) : 0;
}

// Express routes

// Route to get the current number of available seats
app.get('/available_seats', async (req, res) => {
  const numberOfAvailableSeats = await getCurrentAvailableSeats();
  res.json({ numberOfAvailableSeats });
});

// Route to reserve a seat
app.get('/reserve_seat', async (req, res) => {
  if (!reservationEnabled) {
    res.json({ status: "Reservation are blocked" });
    return;
  }

  // Create and queue a job
  const job = queue.create('reserve_seat').save((err) => {
    if (err) {
      res.json({ status: "Reservation failed" });
    } else {
      res.json({ status: "Reservation in process" });
    }
  });
});

// Route to process the queue
app.get('/process', async (req, res) => {
  res.json({ status: "Queue processing" });

  // Process the queue reserve_seat
  queue.process('reserve_seat', async (job, done) => {
    // Decrease the number of available seats
    const currentAvailableSeats = await getCurrentAvailableSeats();
    await reserveSeat(currentAvailableSeats - 1);

    if (availableSeats === 0) {
      reservationEnabled = false;
    }

    if (availableSeats >= 0) {
      console.log(`Seat reservation job ${job.id} completed`);
      done();
    } else {
      console.log(`Seat reservation job ${job.id} failed: Not enough seats available`);
      done(new Error('Not enough seats available'));
    }
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
