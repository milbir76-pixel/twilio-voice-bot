const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const appointments = new Map();
const bookedSlots = new Set();

function generateAvailableSlots() {
    const slots = [];
    const today = new Date();
    const workingHours = {
        weekday: { start: 10, end: 20 },
        saturday: { start: 10, end: 15 }
    };

    for (let day = 1; day <= 14; day++) {
        const date = new Date(today);
        date.setDate(today.getDate() + day);
        
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0) continue;

        const hours = dayOfWeek === 6 ? workingHours.saturday : workingHours.weekday;
        
        for (let hour = hours.start; hour < hours.end; hour++) {
            for (let minute of [0, 30]) {
                const slotTime = new Date(date);
                slotTime.setHours(hour, minute, 0, 0);
                
                const slotKey = `${slotTime.getFullYear()}-${String(slotTime.getMonth() + 1).padStart(2, '0')}-${String(slotTime.getDate()).padStart(2, '0')}_${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                
                if (!bookedSlots.has(slotKey)) {
                    slots.push({
                        date: slotTime.toISOString().split('T')[0],
                        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                        key: slotKey,
                        datetime: slotTime
                    });
                }
            }
        }
    }

    return slots.slice(0, 20);
}

async function getAvailableSlots() {
    try {
        const slots = generateAvailableSlots();
        const formattedSlots = slots.slice(0, 5).map(slot => {
            const date = new Date(slot.datetime);
            const dayName = date.toLocaleDateString('pl-PL', { weekday: 'long' });
            const dateStr = date.toLocaleDateString('pl-PL');
            return `${dayName} ${dateStr} o ${slot.time}`;
        });

        logger.info(`Generated ${formattedSlots.length} available slots`);
        return formattedSlots;

    } catch (error) {
        logger.error('Error getting available slots:', error);
        return ['jutro o 10:00', 'pojutrze o 14:30', 'w piątek o 16:00'];
    }
}

async function bookAppointment(patientData) {
    try {
        const appointmentId = uuidv4();
        const appointment = {
            id: appointmentId,
            patientName: patientData.name,
            phoneNumber: patientData.phone,
            serviceType: patientData.service,
            appointmentDate: patientData.date,
            appointmentTime: patientData.time,
            status: 'scheduled',
            createdAt: new Date().toISOString()
        };

        appointments.set(appointmentId, appointment);
        
        const slotKey = `${patientData.date}_${patientData.time}`;
        bookedSlots.add(slotKey);

        logger.info(`Appointment booked: ${appointmentId} for ${patientData.name} on ${patientData.date} at ${patientData.time}`);

        return {
            success: true,
            appointmentId: appointmentId,
            appointment: appointment
        };

    } catch (error) {
        logger.error('Error booking appointment:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function getAppointment(appointmentId) {
    try {
        const appointment = appointments.get(appointmentId);
        if (!appointment) {
            return { success: false, error: 'Appointment not found' };
        }

        return { success: true, appointment };

    } catch (error) {
        logger.error('Error getting appointment:', error);
        return { success: false, error: error.message };
    }
}

async function cancelAppointment(appointmentId) {
    try {
        const appointment = appointments.get(appointmentId);
        if (!appointment) {
            return { success: false, error: 'Appointment not found' };
        }

        appointment.status = 'cancelled';
        appointment.cancelledAt = new Date().toISOString();

        const slotKey = `${appointment.appointmentDate}_${appointment.appointmentTime}`;
        bookedSlots.delete(slotKey);

        logger.info(`Appointment cancelled: ${appointmentId}`);

        return { success: true, appointment };

    } catch (error) {
        logger.error('Error cancelling appointment:', error);
        return { success: false, error: error.message };
    }
}

async function getTodaysAppointments() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todaysAppointments = Array.from(appointments.values())
            .filter(apt => apt.appointmentDate === today && apt.status === 'scheduled')
            .sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime));

        logger.info(`Found ${todaysAppointments.length} appointments for today`);
        return todaysAppointments;

    } catch (error) {
        logger.error('Error getting today\'s appointments:', error);
        return [];
    }
}

function getAppointmentStats() {
    const totalAppointments = appointments.size;
    const scheduled = Array.from(appointments.values()).filter(apt => apt.status === 'scheduled').length;
    const cancelled = Array.from(appointments.values()).filter(apt => apt.status === 'cancelled').length;

    return {
        total: totalAppointments,
        scheduled: scheduled,
        cancelled: cancelled,
        bookedSlots: bookedSlots.size
    };
}

module.exports = {
    getAvailableSlots,
    bookAppointment,
    getAppointment,
    cancelAppointment,
    getTodaysAppointments,
    getAppointmentStats
};