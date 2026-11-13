# Domain state machines

Reservation transitions are pure functions over a state, event, context, and supplied timestamp.
The reservation transition table explicitly lists eligible source states, events, and roles.
Amounts are integer cents and are checked as non-negative safe integers.
Payment settlement records the payment state; it never confirms a reservation automatically.
Advisors or admins must confirm after availability is validated and the payment threshold is met.
Rejecting or cancelling a paid reservation opens a refund pending state.
Finance records refund completion with a required reason.
Terminal reservation states are rejected, cancelled, refunded, and completed.
Cancellation by a customer is limited to draft and pre-confirmation states.
Payment records use COP and retain processed provider event identifiers.
Repeated payment event identifiers are idempotent.
Out of order payment events cannot downgrade the current payment status.
Provider status changes are attributed to SYSTEM; refunds require FINANCE.
The machines perform no I/O and do not read the current clock.
Callers supply event data, context, actor, and timestamp explicitly.