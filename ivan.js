import makeWASocket, { delay, useMultiFileAuthState, fetchLatestWaWebVersion, makeInMemoryStore, jidNormalizedUser, PHONENUMBER_MCC, DisconnectReason} from "sanswa"
import serialize from "./mess.js"
import { Boom } from '@hapi/boom'
import pino from "pino"
import fs from "fs"
import { join } from 'path';
import { ai } from "./ai.js"
import http from 'http';
import fetch from "node-fetch"
const set = JSON.parse(await fs.readFileSync("./setelan.json", "utf-8"))
const logger = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` }).child({ class: "sansbot" })
logger.level = "silent"
const store = makeInMemoryStore({ logger })
const usePairingCode = set.nomorbot
const sesi = set.sesi
store.readFromFile(`./store.json`)

const runSans = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(`./${sesi}`)
  const { version, isLatest } = await fetchLatestWaWebVersion()

   console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

  const van = makeWASocket.default({
    logger,
    version,
    printQRInTerminal: !usePairingCode,
    auth: state,
    browser: ['Chrome (Linux)', '', ''],
    generateHighQualityLinkPreview: true
  })

  store?.bind(van.ev);

  if (usePairingCode && !van.authState.creds.registered) {
      let phoneNumber = usePairingCode.replace(/[^0-9]/g, '')

      if (!Object.keys(PHONENUMBER_MCC).some(v => phoneNumber.startsWith(v))) throw "Start with your country's WhatsApp code, Example : 62xxx"

      await delay(3000)
      let code = await van.requestPairingCode(phoneNumber)
      console.log(`\x1b[32m${code?.match(/.{1,4}/g)?.join("-") || code}\x1b[39m`)
   }

  van.ev.on("connection.update", (update) => {
        const { lastDisconnect, connection, qr } = update
        if (connection) {
           console.info(`Connection Status : ${connection}`)
        }

        if (connection === "close") {
           let reason = new Boom(lastDisconnect?.error)?.output.statusCode

           switch (reason) {
              case DisconnectReason.badSession:
                 console.info(`Bad Session File, Restart Required`)
                 runSans()
                 break
              case DisconnectReason.connectionClosed:
                 console.info("Connection Closed, Restart Required")
                 runSans()
                 break
              case DisconnectReason.connectionLost:
                 console.info("Connection Lost from Server, Reconnecting...")
                 runSans()
                 break
              case DisconnectReason.connectionReplaced:
                 console.info("Connection Replaced, Restart Required")
                 runSans()
                 break
              case DisconnectReason.restartRequired:
                 console.info("Restart Required, Restarting...")
                 runSans()
                 break
              case DisconnectReason.loggedOut:
                 console.error("Device has Logged Out, please rescan again...")
                 van.end()
                 fs.rmSync(`./${sesi}`, { recursive: true, force: true })
                 break
              case DisconnectReason.multideviceMismatch:
                 console.error("Nedd Multi Device Version, please update and rescan again...")
                 van.end()
                 fs.rmSync(`./${sesi}`, { recursive: true, force: true })
                 break
              default:
                 console.log("Aku ra ngerti masalah opo iki")
                 runSans()
           }
        }

        if (connection === "open") {
           console.log("berhasil login")
        }
  })

  van.ev.on ('creds.update', saveCreds)
van.ev.on("groups.update", (updates) => {
      for (const update of updates) {
         const id = update.id
         if (store.groupMetadata[id]) {
            store.groupMetadata[id] = { ...(store.groupMetadata[id] || {}), ...(update || {}) }
         }
      }
   })

   // merubah status member
   van.ev.on('group-participants.update', ({ id, participants, action }) => {
      const metadata = store.groupMetadata[id]
      if (metadata) {
         switch (action) {
            case 'add':
            case "revoked_membership_requests":
               metadata.participants.push(...participants.map(id => ({ id: jidNormalizedUser(id), admin: null })))
               break
            case 'demote':
            case 'promote':
               for (const participant of metadata.participants) {
                  let id = jidNormalizedUser(participant.id)
                  if (participants.includes(id)) {
                     participant.admin = (action === "promote" ? "admin" : null)
                  }
               }
               break
            case 'remove':
               metadata.participants = metadata.participants.filter(p => !participants.includes(jidNormalizedUser(p.id)))
               break
         }
      }
   })
   van.ev.on('messages.upsert', async ({ messages }) => {
        let pp
        try {
           pp = 'https://telegra.ph/file/33b1c3d4d4b51fd47a9da.png'
           if (!messages[0].message) return
           let m = await serialize(van, messages[0], store)
           console.log(`
----------------------------------------------
sender: ${m.sender}
name: ${m.pushName}
id: ${m.from}
text: ${m.body}
----------------------------------------------
`)
if(!m.sender === "6285809011357@s.whatsapp.net"){
           await van.readMessages([m.key])
           }
           if(m.from === "120363023450024702@g.us") return;
           await van.sendPresenceUpdate('composing', m.from)
           if (!m.sender.startsWith('62' || '60')){
van.updateBlockStatus(m.sender, "block")
}
           if (m.body === "startai"){
           await van.sendMessage(m.from, { text: "chat ai dimulai, silahkan balas pesan ini dengan pertanyaan anda", contextInfo: {
            forwardingScore: 9999,

            externalAdReply: { // Bagian ini sesuka kalian berkreasi :'v
                    showAdAttribution: true,
               title: "balas pesan ini",
               body: "untuk melanjutkan chat dengan ai",
               description: 'balas selain chat ini "tidak di respon"',
               previewType: "PHOTO",
               thumbnail: await (await fetch(pp)).buffer(),
               sourceUrl: "https://saweria.co/sansbotbyivan",					
            }
         }}, { quoted: m })
           }
           if (m.body === "cleardata") {
           if (!(await fs.existsSync("./datagpt.json"))) {
        await fs.writeFileSync("./datagpt.json", '{}');
      }
      let dataai = JSON.parse(await fs.readFileSync("./datagpt.json", "utf-8"));
delete dataai[m.sender]
await fs.writeFileSync("./datagpt.json", JSON.stringify(dataai, null, 2));
return van.sendMessage(m.from, { text: "berhasil hapus data chat"}, {quoted: m})
}
           if (m.body === "clearsesions") {
           if(!m.sender === "6285809011357@s.whatsapp.net"){
           return await van.sendMessage(m.from, { text: "kamu bukan pemilikku"},{quoted: m})
           }
           const folderPath = './sanssesi';
           const fileToKeep = 'creds.json';

hapusFile(folderPath, fileToKeep);
}
           if (m.quoted?.fromMe){
              if(!m.isBot && m.quoted.isBot){
                let res = await ai(m.sender, m.pushName, m.body)
                 await van.sendMessage(m.from, { text: `${res}



*_CHAT BOT AI BUATAN IVAN_*`, contextInfo: {
            forwardingScore: 9999,

            externalAdReply: { // Bagian ini sesuka kalian berkreasi :'v
                    showAdAttribution: true,
               title: "balas pesan ini",
               body: "untuk melanjutkan chat dengan ai",
               description: 'balas selain chat ini "tidak di respon"',
               previewType: "PHOTO",
               thumbnail: await (await fetch(pp)).buffer(),
               sourceUrl: "https://wa.me/6285809011357",					
            }
         }}, { quoted: m })
              }
           }
        } catch (e) {
console.log(e)
        }
   })
}

async function getMessage(key) {
   try {
      const jid = jidNormalizedUser(key.remoteJid)
      const msg = await store.loadMessage(jid, key.id)

      return msg?.message || ""

      return ""
   } catch { }
}


async function hapusFile(folderPath, fileToKeep) {
  try {
    const files = await fs.readdirSync(folderPath);

    for (const file of files) {
      if (file !== fileToKeep) {
        const filePath = join(folderPath, file);
        await fs.unlinkSync(filePath);
        console.log(`File ${file} dihapus.`);
      }
    }

    console.log('Operasi penghapusan selesai.');
    process.send('reset')
  } catch (error) {
    console.error('Error:', error.message);
  }
}





const server = http.createServer((_, res) => res.end("bang on bang uptimenya 🗿"));

server.listen(8080, () => {
  console.log('Server berjalan di port 8080');
});


runSans()


