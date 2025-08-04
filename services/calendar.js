const { v4: uuid } = require('uuid');

const slots = {}; // { '2025-08-05': ['10:00','10:30',…], … }
const appointments = [];

function initSlots(date) {
  if (slots[date]) return;
  const hours = [];
  for (let h = 10; h < 20; h++) {
    hours.push(`${h.toString().padStart(2,'0')}:00`);
    if (h < 15 || h > 9) hours.push(`${h.toString().padStart(2,'0')}:30`);
  }
  slots[date] = hours;
}

function getAvailableSlots(date) {
  initSlots(date);
  const booked = appointments
    .filter(a => a.date === date)
    .map(a => a.time);
  return slots[date].filter(t => !booked.includes(t));
}

function bookAppointment({ name, phone, service, date, time }) {
  initSlots(date);
  if (!slots[date].includes(time)) {
    throw new Error('Nieprawidłowa godzina');
  }
  if (appointments.find(a => a.date === date && a.time === time)) {
    throw new Error('Slot już zarezerwowany');
  }
  const id = uuid();
  appointments.push({ id, name, phone, service, date, time });
  return id;
}

module.exports = { getAvailableSlots, bookAppointment };
