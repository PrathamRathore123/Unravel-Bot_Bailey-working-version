const mysql = require('mysql2/promise');
const config = require('./config');

class MySQLConnector {
  constructor() {
    this.connection = null;
    this.initConnection();
  }

  async initConnection() {
    try {
      this.connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'travel_bot',
        port: process.env.DB_PORT || 3306
      });

      console.log('MySQL connected successfully');
    } catch (error) {
      console.error('MySQL connection failed:', error);
      // Don't throw error, allow the bot to work without database
    }
  }

  async createBooking(bookingData) {
    if (!this.connection) {
      console.warn('No database connection, skipping booking save');
      return null;
    }

    try {
      const query = `
        INSERT INTO bookings
        (name, destination, travel_date, end_date, guests, special_requests, user_id, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const values = [
        bookingData.name,
        bookingData.destination,
        bookingData.travel_date,
        bookingData.end_date,
        bookingData.guests,
        bookingData.special_requests,
        bookingData.user_id,
        bookingData.phone
      ];

      const [result] = await this.connection.execute(query, values);
      console.log('Booking saved to database, ID:', result.insertId);
      return result.insertId;
    } catch (error) {
      console.error('Failed to save booking:', error);
      return null;
    }
  }

  async getCustomerBookings(phoneNumber) {
    if (!this.connection) {
      return [];
    }

    try {
      const query = 'SELECT * FROM bookings WHERE phone = ? ORDER BY created_at DESC';
      const [rows] = await this.connection.execute(query, [phoneNumber]);
      return rows;
    } catch (error) {
      console.error('Failed to get customer bookings:', error);
      return [];
    }
  }

  async closeConnection() {
    if (this.connection) {
      await this.connection.end();
      console.log('MySQL connection closed');
    }
  }
}

module.exports = MySQLConnector;
