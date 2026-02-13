const axios = require('axios');
const config = require('./config');

class APIConnector {
  constructor() {
    this.backendUrl = config.BACKEND_URL;
  }

  async sendVendorEmail(inquiryData) {
    try {
      console.log('Sending vendor email inquiry:', inquiryData);

      const response = await axios.post(`${this.backendUrl}/api/send-vendor-email/`, inquiryData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Vendor email sent successfully:', response.data);
      return true;
    } catch (error) {
      console.error('Failed to send vendor email:', error.response ? error.response.data : error.message);
      return false;
    }
  }

  async sendDaywiseBookingEmail(bookingInfo) {
    try {
      console.log('Sending daywise booking email:', bookingInfo);

      const response = await axios.post(`${this.backendUrl}/api/send-daywise-booking/`, bookingInfo, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('Daywise booking email sent successfully:', response.data);
      return true;
    } catch (error) {
      console.error('Failed to send daywise booking email:', error.response ? error.response.data : error.message);
      return false;
    }
  }

  async getCustomerData(phoneNumber) {
    try {
      console.log('Fetching customer data for:', phoneNumber);

      const response = await axios.get(`${this.backendUrl}/api/customer/${phoneNumber}/`);

      console.log('Customer data retrieved:', response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to get customer data:', error.response ? error.response.data : error.message);
      return null;
    }
  }
}

module.exports = APIConnector;
