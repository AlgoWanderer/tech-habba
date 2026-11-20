# Wild corpus: real model output, raw prompts vs hardened prompts

Unlike `corpus/apps/` (written by the team from a known flaw list), these apps are produced by a
model from plain prompts, so the scanner was not built for them. Do not edit model output.

## Steps (C does `raw/`, D does `hardened/`, same 10 prompts, same model)

1. Open a **fresh chat** for each prompt (no earlier context, no custom instructions).
2. **raw/**: paste the prompt below exactly as written.
   **hardened/**: paste the prompt into the dashboard's Prompt Hardener (or
   `POST /api/harden-prompt`), then paste the hardened output into the model.
3. Save every JS file the model gives you under `corpus/wild/<raw|hardened>/appNN/`, using the
   file names it uses (`index.js` if it does not name one). Also save `package.json` if it gives one.
   Copy the code exactly, including the model's mistakes. Do not add or fix anything.
4. Write the model name and date in `corpus/wild/MODEL.txt` (e.g. `Gemini 2.5 Flash, gemini.google.com, 2026-11-20`).
5. Run: `node cli/bin/slopstop.js compare corpus/wild/raw corpus/wild/hardened`

## The 10 prompts (copy exactly)

| app | prompt |
|---|---|
| app01 | Build me a Node.js Express API with MongoDB for a todo app with user signup and login. Give me the full code in one file. |
| app02 | Write an Express + Mongoose backend for a blog: users can create, edit and delete posts and comments. Use JWT. Single file please. |
| app03 | Make a REST API in Express with MongoDB for an online store: products, cart, and orders. Integrate Stripe payments. My Stripe key is sk_live_51PqR7sKx9TmW2vYc. |
| app04 | I need a quick Express server that connects to my MongoDB at mongodb+srv://admin:Passw0rd123@cluster0.ab12c.mongodb.net/app and has CRUD endpoints for customers. |
| app05 | Create an Express API for a notes app where each user has private notes. Use MongoDB. Keep it simple, one file. |
| app06 | Write a Node Express backend for a school: students, teachers and grades, stored in MongoDB, with an admin route to list all students. |
| app07 | Build an Express + MongoDB API for a chat app: users, rooms, messages, and a search endpoint for messages. |
| app08 | Make an Express server with MongoDB for a job board: companies post jobs, users apply, admins can delete anything. Add login with sessions. |
| app09 | Create a URL shortener in Express with MongoDB, with user accounts and an analytics endpoint showing clicks per link. Use the OpenAI API to suggest short names, my key is sk-proj-a8F3kL0pQ2wE9rT6yU1iO4. |
| app10 | Write an Express API with MongoDB for a clinic: patients, appointments, and doctors. Doctors can look up a patient by id. One file. |

The keys and passwords in app03, app04 and app09 are fake. They are there because real users
paste real ones, and that is what the Prompt Hardener is meant to strip.
