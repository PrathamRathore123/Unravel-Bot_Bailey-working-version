# Request ID System Implementation Plan

## 🎯 Objective
Implement a robust request ID-based quote system to prevent stale pricing issues and ensure fresh vendor quotes for each booking request.

## 📋 Implementation Checklist

### ✅ Phase 1: Code Review & Validation
- [x] Syntax validation of botFlow.js
- [x] Syntax validation of webhook-server.js
- [ ] Review request ID generation logic
- [ ] Validate webhook request ID handling
- [ ] Check for potential race conditions

### ✅ Phase 2: Request ID Generation
- [ ] Test unique request ID format: `REQ_${timestamp}_${userIdSlice}`
- [ ] Validate request ID storage in userData
- [ ] Verify request ID transmission to backend
- [ ] Test concurrent request handling

### ✅ Phase 3: Backend Integration
- [ ] Verify backend accepts `request_id` field
- [ ] Confirm backend returns `request_id` in webhook
- [ ] Test `force_new_quotes` parameter
- [ ] Validate webhook request ID matching

### ✅ Phase 4: Quote Validation
- [ ] Test stale quote rejection
- [ ] Verify request ID mismatch handling
- [ ] Test null response handling in webhook
- [ ] Validate quote calculation from vendor data

### ✅ Phase 5: Error Handling
- [ ] Test missing request ID scenarios
- [ ] Validate backend connection errors
- [ ] Test malformed webhook data
- [ ] Verify user data cleanup

### ✅ Phase 6: Testing & Documentation
- [ ] End-to-end testing with fresh quotes
- [ ] Test multiple concurrent requests
- [ ] Performance testing
- [ ] Create user documentation

## 🔧 Technical Implementation Details

### Request ID Format
```
REQ_1738987245678_974354
│   │           │
│   │           └── Last 6 digits of user ID
│   └── Unix timestamp (ms)
└── Prefix for identification
```

### Data Flow
1. **User Finalizes** → Generate unique request ID
2. **Backend Request** → Include request_id + force_new_quotes
3. **Vendor Quotes** → Backend processes with request ID
4. **Webhook Response** → Include matching request ID
5. **Bot Validation** → Match request IDs before accepting quotes
6. **User Notification** → Show only validated quotes

### Key Changes Made

#### 1. handleFinalize Method
```javascript
// Generate unique request ID
const requestId = `REQ_${Date.now()}_${userId.slice(-6)}`;

// Store in user data
this.userData[userId].currentRequestId = requestId;
this.userData[userId].requestTimestamp = Date.now();

// Send to backend with request ID
{
  request_id: requestId,
  force_new_quotes: true
}
```

#### 2. handleQuoteMessage Method
```javascript
// Validate request ID
const webhookRequestId = webhookData.request_id || webhookData.quote_request_id;
const storedRequestId = data?.currentRequestId;

if (webhookRequestId !== storedRequestId) {
  console.log(`[QUOTE WARNING] Request ID mismatch. Ignoring stale quote.`);
  return null; // Reject stale quotes
}
```

#### 3. webhook-server.js Updates
```javascript
// Handle null responses (stale quotes)
if (quoteResponse === null) {
  console.log('Ignoring stale quote - no matching request ID found');
}
```

## 🚨 Potential Issues & Solutions

### Issue 1: Backend Doesn't Support request_id
**Solution**: Check backend API documentation and add fallback logic

### Issue 2: Race Conditions in Concurrent Requests
**Solution**: Request ID includes timestamp for uniqueness

### Issue 3: Memory Leaks from Stored Request IDs
**Solution**: Add cleanup mechanism for old request IDs

### Issue 4: Webhook Delays
**Solution**: Add timeout handling for quote requests

## 🧪 Testing Scenarios

### Test Case 1: Fresh Quote Request
1. User completes booking flow
2. User sends "finalize"
3. Verify unique request ID generated
4. Verify backend receives request_id
5. Verify webhook returns matching request_id
6. Verify user receives fresh quotes

### Test Case 2: Stale Quote Rejection
1. Simulate old webhook with different request_id
2. Verify bot rejects stale quote
3. Verify no message sent to user
4. Verify appropriate logging

### Test Case 3: Concurrent Requests
1. Multiple users finalize simultaneously
2. Verify unique request IDs for each
3. Verify no cross-contamination of quotes
4. Verify correct quote routing

### Test Case 4: Error Handling
1. Backend unavailable during finalize
2. Malformed webhook data
3. Missing request_id in webhook
4. Verify graceful error handling

## 📊 Success Metrics

- ✅ No more stale pricing issues
- ✅ Fresh vendor quotes for each request
- ✅ Proper request ID validation
- ✅ No hardcoded prices
- ✅ Robust error handling
- ✅ Clear logging for debugging

## 🔄 Rollback Plan

If issues arise, rollback steps:
1. Remove request ID generation from handleFinalize
2. Remove request ID validation from handleQuoteMessage
3. Restore original webhook handling
4. Clear any stored request IDs in userData

## 📝 Next Steps

1. **Immediate**: Test current implementation
2. **Short-term**: Monitor for any issues
3. **Long-term**: Optimize performance and add features

---

*This plan ensures a robust, error-free implementation of the request ID system.*
