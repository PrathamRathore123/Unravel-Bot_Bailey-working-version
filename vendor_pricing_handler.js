// Add this to your botFlow.js to handle final pricing messages

function handleFinalPricing(data) {
    const { customer_name, customer_phone, message, quotes_count, best_price, best_vendor } = data;
    
    return {
        messages: [message],
        nextState: 'awaiting_vendor_selection',
        metadata: {
            type: 'final_pricing',
            customer_name,
            customer_phone,
            quotes_count,
            best_price,
            best_vendor
        }
    };
}

// Add this to handle vendor selection
function handleVendorSelection(userId, vendorNumber) {
    const metadata = this.getUserMetadata(userId);
    
    if (metadata && metadata.type === 'final_pricing') {
        // Here you would:
        // 1. Confirm the vendor selection
        // 2. Send confirmation to backend
        // 3. Update booking status
        // 4. Send payment instructions
        
        return {
            messages: [
                `*VENDOR CONFIRMED!*\n\n` +
                `You've selected vendor ${vendorNumber}. Our team will contact you shortly to finalize the booking and payment.\n\n` +
                `Expected contact within 24 hours\n` +
                `Payment details will be shared via email\n\n` +
                `Thank you for choosing *Unravel Experience*!`
            ],
            nextState: 'booking_confirmed'
        };
    }
    
    return {
        messages: ["Please select a vendor number from the pricing list."],
        nextState: 'awaiting_vendor_selection'
    };
}
