# Citizen status tracking and final outcomes

The user requests removing the login emergency button and the home "ดูคำร้องของฉันทั้งหมด" button; naming navigation and heading "ติดตามสถานะ"; making all terminal complaints reach the final "ปิดเรื่อง" step; publishing the final rejection/denial/closure reason to citizens; improving tracking layout; and using the same full-page detail presentation for followed and self-reported cases.

Use the existing green design system. Tracking uses responsive cards with status, reference, dates and clear detail/unfollow actions. Followed details reuse Detail in a public/read-only mode, return to the following tab, and preserve the community endpoint's rounded locations and approved media. Reporter-only uploads and private data remain unavailable to followers. Self-reported detail retains its existing permissions.

Centralize the citizen-visible audit projection. Both own and community detail expose the reason only on the last REJECT/DENY/CLOSE event matching the complaint's current terminal status. Active complaints and other audit rows expose no internal reasons or actor details. Keep existing same-municipality and reporter authorization intact. A missing legacy reason is stated honestly rather than invented.

Terminal statuses CLOSED, REJECTED and TERMINATED select the final step. Rejected/terminated outcomes remain visually distinct from successful closure, and unperformed stages are marked as such using transition history. Citizen details use the content width rather than retaining the empty staff-action column.

Test login/home button removal, renamed tracking links, desktop/mobile tracking and followed detail navigation, final progress/reasons, read-only NEW followed cases, terminal-only reason projection, original-location privacy and cross-municipality access.
