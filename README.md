# ClassPoll Version 1.1.0

A simple live classroom polling web app designed for GitHub Pages + Firebase Realtime Database.

## What Version 1 does

- Instructor creates one multiple-choice poll at a time.
- 2–6 response choices.
- Generates a QR code that opens the poll directly on a student's phone.
- Anonymous student responses.
- One response per browser/device for each poll.
- Results update live on the instructor screen.
- Results can be hidden until the instructor chooses to reveal them.
- Instructor can close/reopen voting.
- Full-screen results mode for classroom projection.

## Files

- `index.html` — the webpage.
- `styles.css` — appearance and mobile layout.
- `app.js` — polling logic.
- `config.js` — Firebase connection settings.

## One-time Firebase setup

The app needs Firebase so student phones and the instructor computer can share live data.

1. Go to https://console.firebase.google.com/ and sign in with a Google account.
2. Choose **Create a project**.
3. Give it a simple name such as `classpoll` and finish creating the project. Google Analytics is not required for this app.
4. In the Firebase project, open **Build > Realtime Database**.
5. Click **Create Database**. Choose a location and select **Start in test mode** for initial setup.
6. Return to **Project Overview** and click the **Web** icon (`</>`) to add a web app.
7. Give the web app a nickname such as `ClassPoll Web`. Firebase Hosting is not required because GitHub Pages will host the website.
8. Firebase will show a block called `firebaseConfig`. Copy the values into `config.js`, replacing each `PASTE_...` placeholder.
9. In Realtime Database, open the **Rules** tab and replace the rules with:

```json
{
  "rules": {
    "polls": {
      "$pollId": {
        ".read": true,
        ".write": true
      }
    },
    "responses": {
      "$pollId": {
        ".read": true,
        "$respondentId": {
          ".write": "!data.exists()"
        }
      }
    }
  }
}
```

10. Click **Publish**.

These Version 1 rules are deliberately simple for classroom use. Anyone who obtains a valid poll link can read that poll and submit a response. They should not be used for exams, confidential surveys, graded assessments, or sensitive information.

## Publish on GitHub Pages

Upload these four web files to a GitHub repository:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`

The `README.md` file is optional for the published website but useful to keep in the repository.

Then enable GitHub Pages in **Settings > Pages**, publishing from the repository's main branch and root folder.

Open the GitHub Pages address on your classroom computer. The instructor screen appears automatically.

## How to use it in class

1. Enter the question.
2. Enter at least two response choices.
3. Click **Open poll**.
4. Project the QR code.
5. Students scan it and vote on their phones.
6. Watch the response count increase.
7. Click **Reveal results** when you want the class to see the distribution.
8. Use **Close voting** to stop additional responses.
9. Click **New poll** for the next question.

## Notes about anonymous / duplicate voting

Version 1 creates a random identifier in the student's browser and uses it to prevent a second response from that same browser for that poll. A student could technically vote again by switching browsers, clearing browser storage, or using another device. This is appropriate for informal classroom polling, not secure elections or graded testing.


## Version 1.1
Adds instructor-controlled sharing of poll results to student phones. Results remain projector-only unless the instructor chooses **Share results with students** after revealing them.
