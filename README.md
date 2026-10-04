# ClassPoll Version 1.3 Secure

ClassPoll 1.3 adds Firebase Authentication and is designed to work with restricted Realtime Database security rules.

## Security model
- Instructor signs in with Google.
- Students are authenticated anonymously in the background; they do not see a login screen.
- Realtime Database rules should restrict instructor operations to the instructor Firebase UID.
- Students can read live poll information and submit only their own vote.
- Students can read response totals only when the instructor enables result sharing.

## Existing features retained
Saved poll sets, QR-code student access, live response counts, close/reopen voting, reveal/hide results, share results with students, and full-screen projection.

## Deployment
Upload app.js, config.js, index.html, README.md, and styles.css to the existing GitHub Pages repository. Then complete Firebase Authentication setup and publish the Version 1.3 Realtime Database rules.
