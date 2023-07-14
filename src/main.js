const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
require('dotenv').config()

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up Google Drive API credentials
// const keyPath = path.join(__dirname, 'gdrive-uploader-311718-d160a815f987.json');
// const keyFile = fs.readFileSync(keyPath);
// const credentials = JSON.parse(keyFile);
const scopes = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.JWT(
  process.env.client_email,
  null,
  process.env.private_key,
  scopes
);
const drive = google.drive({ version: 'v3', auth });

// Set up Multer for file uploads
const upload = multer({ dest: 'tmp/' });

// Handle file uploads
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const fileMetadata = {
      name: req.file.originalname,
      parents: [process.env.folder_id],
    };
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path),
    };
    const { data } = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
    });

    // Delete local file uploaded by Multer
    fs.unlinkSync(req.file.path);

    res.send(`File uploaded with ID: ${data.id}`);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

// Serve images from Google Drive
app.get('/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
    data.on('end', () => res.end());
    data.on('error', error => {
      console.error(error);
      res.status(500).send(error.message);
    });
    data.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

// Serve admin UI
app.get('/admin', async (req, res) => {
    try {
      const { data } = await drive.files.list({
        q: "mimeType='image/jpeg' or mimeType='image/png'",
        fields: 'files(id,name)',
        orderBy: 'createdTime desc',
      });
      const images = data.files.map(file => ({
        id: file.id,
        name: file.name,
        url: `/images/${file.id}`,
        deleteUrl: `/admin/delete/${file.id}`,
      }));
      res.send(`
        <html>
          <head>
            <title>Image Gallery</title>
          </head>
          <body>
            <h1>Image Gallery</h1>
            <ul>
              ${images
                .map(
                  image => `
                    <li>
                      <div style="width=10px; height=10px;">
                        <img src="${image.url}" alt="${image.name}" style="  width: 100%; height: 100%; object-fit: cover;"/>
                      </div>
                      <a href="${image.url}">${image.name}</a>
                      <a href="${image.deleteUrl}" > <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20"><path d="M261-120q-24.75 0-42.375-17.625T201-180v-570h-41v-60h188v-30h264v30h188v60h-41v570q0 24-18 42t-42 18H261Zm438-630H261v570h438v-570ZM367-266h60v-399h-60v399Zm166 0h60v-399h-60v399ZM261-750v570-570Z"/></svg> </a>
                    </li>
                  `
                )
                .join('\n')}
            </ul>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(error);
      res.status(500).send(error.message);
    }
  });
  
  // Delete image
  app.get('/admin/delete/:id', async (req, res) => {
    try {
      const { id } = req.params;
      // Delete file from Google Drive
      await drive.files.delete({ fileId: id });
  

  
      res.redirect('/admin');
    } catch (error) {
      console.error(error);
      res.status(500).send(error.message);
    }
  });

// Start server
app.listen(3000, () => console.log('Server started on port 3000'));
