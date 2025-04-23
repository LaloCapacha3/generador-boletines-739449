import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import AWS from 'aws-sdk';
import path from 'path';

dotenv.config();

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

interface BoletinItem {
  id: string;
  contenido: string;
  correo: string;
  archivoUrl: string;
  leido: boolean;
}

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/descargar/:boletinId', async (req: Request, res: Response) => {
  try {
    const { boletinId } = req.params;
    
    const getParams = {
      TableName: process.env.DYNAMODB_TABLE!,
      Key: {
        "id": boletinId
      }
    };

    const getResult = await dynamoDB.get(getParams).promise();
    
    if (!getResult.Item) {
      res.status(404).json({ 
        error: 'Boletín no encontrado' 
      });
      return;
    }
    const boletin = getResult.Item as BoletinItem;

    const fileKey = boletin.archivoUrl;
    const extension = path.extname(fileKey);
    const fileName = `${boletinId}${extension}`;
    
    const params = { 
      Bucket: process.env.S3_BUCKET_NAME!, 
      Key: fileName
    };

    const file = await s3.getObject(params).promise();
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    let contentType = '';
    
    if (extension === '.jpg' || extension === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (extension === '.png') {
      contentType = 'image/png';
    } else if (extension === '.pdf') {
      contentType = 'application/pdf';
    }
    
    res.setHeader('Content-Type', contentType);
    res.send(file.Body);
  } catch (error) {
    console.error('Error al descargar el archivo:', error);
    res.status(500).json({ error: 'Error al descargar el archivo' });
  }
});

app.get('/boletines/:boletinId', async (req: Request, res: Response) => {
  try {
    const { boletinId } = req.params;
    const correoElectronico = req.query.correoElectronico as string;

    if (!boletinId || !correoElectronico) {
      res.status(400).json({ 
        error: 'Se requiere un ID de boletín y un correo electrónico' 
      });
      return;
    }

    const getParams = {
      TableName: process.env.DYNAMODB_TABLE!,
      Key: {
        "id": boletinId
      }
    };

    const getResult = await dynamoDB.get(getParams).promise();
    
    if (!getResult.Item) {
      res.status(404).json({ 
        error: 'Boletín no encontrado' 
      });
      return;
    }
    
    const boletin = getResult.Item as BoletinItem;
    
    if (boletin.correo !== correoElectronico) {
      res.status(403).json({ 
        error: 'No tienes permiso para ver este boletín' 
      });
      return;
    }

    if (!boletin.leido) {
      const updateParams = {
        TableName: process.env.DYNAMODB_TABLE!,
        Key: {
          "id": boletinId
        },
        UpdateExpression: "set leido = :leido",
        ExpressionAttributeValues: {
          ":leido": true
        }
      };

      await dynamoDB.update(updateParams).promise();
    }
    
    const fileKey = boletin.archivoUrl;
    const extension = path.extname(fileKey);
    const fileName = `${boletinId}${extension}`;
    console.log(fileName);

    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: fileName,
      Expires: 3600
    });
    
    const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(extension);
    const isPdf = extension === '.pdf';
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Boletín</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          background-color: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
          margin-bottom: 30px;
        }
        .boletin-content {
          margin-bottom: 30px;
        }
        .imagen-container {
          text-align: center;
          margin: 30px 0;
          min-height: 200px;
          border: 1px solid #ddd;
          padding: 10px;
          border-radius: 4px;
        }
        .imagen-container img {
          max-width: 100%;
          max-height: 500px;
        }
        .archivo-link {
          display: inline-block;
          background-color: #4CAF50;
          color: white;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
          margin-top: 20px;
        }
        .archivo-link:hover {
          background-color: #45a049;
        }
        .imagen-error {
          padding: 20px;
          color: #721c24;
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
        }
        .pdf-container {
          width: 100%;
          height: 500px;
          border: none;
        }
        .boletin-footer {
          margin-top: 30px;
          text-align: center;
          font-size: 0.8em;
          color: #777;
          border-top: 1px solid #eee;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Boletín</h1>
        <div class="boletin-content">
          <p>${boletin.contenido}</p>
          
          <div class="imagen-container">
            ${isImage ? 
              `<img src="${url}" alt="Imagen del boletín" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'imagen-error\\'>No se pudo cargar la imagen. <a href=\\'/descargar/${boletinId}?correoElectronico=${encodeURIComponent(correoElectronico)}\\' target=\\'_blank\\'>Ver archivo directamente</a></div>';" />` : 
              isPdf ? 
              `<iframe class="pdf-container" src="${url}" type="application/pdf" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'imagen-error\\'>No se pudo cargar el PDF. <a href=\\'/descargar/${boletinId}?correoElectronico=${encodeURIComponent(correoElectronico)}\\' target=\\'_blank\\'>Ver archivo directamente</a></div>';">
                <p>Tu navegador no puede mostrar el PDF. <a href="${url}">Haz clic aquí para ver el archivo</a>.</p>
              </iframe>` : 
              `<div>Archivo no es una imagen o PDF. <a href="/descargar/${boletinId}?correoElectronico=${encodeURIComponent(correoElectronico)}" target="_blank">Descargar archivo</a></div>`
            }
          </div>
          
          <div style="text-align: center;">
            <a href="/descargar/${boletinId}?correoElectronico=${encodeURIComponent(correoElectronico)}" class="archivo-link">Descargar archivo completo</a>
          </div>
        </div>
        <div class="boletin-footer">
          <p>Este boletín fue enviado a ${boletin.correo}</p>
        </div>
      </div>
    </body>
    </html>
    `;

    res.send(html);
    return;

  } catch (error) {
    console.error('Error al mostrar el boletín:', error);
    res.status(500).json({ error: 'Error al recuperar el boletín' });
    return;
  }
});

app.listen(port, () => {
  console.log(`Actividad 3 iniciada en el puerto ${port}`);
});
