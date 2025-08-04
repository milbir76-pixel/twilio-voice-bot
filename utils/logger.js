// utils/logger.js
// Prosty logger oparty na bibliotece Winston

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

// Definiujemy format logów: data, poziom, wiadomość
const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

// Tworzymy instancję loggera
const logger = createLogger({
  level: 'info',  // domyślny poziom logowania
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize(),
    logFormat
  ),
  transports: [
    new transports.Console(), // logi do konsoli
    // Aby zapisywać do pliku, odkomentuj:
    // new transports.File({ filename: 'logs/app.log' })
  ],
  exceptionHandlers: [
    new transports.Console(),
    // new transports.File({ filename: 'logs/exceptions.log' })
  ],
  exitOnError: false  // nie zamykaj aplikacji przy błędzie logowania
});

module.exports = logger;
