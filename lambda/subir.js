// Handler para POST /uploads y GET /uploads/{proxy+}
//
// POST firma una URL de subida (PUT) que caduca en 5 minutos.
// GET firma una URL de lectura (GET) que caduca en 1 hora.

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const s3 = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' })
const BUCKET = process.env.BUCKET

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const EXTENSIONES = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    // POST /uploads - firma URL de subida
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const { altarId, contentType } = body

      if (!altarId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Falta altarId' }),
        }
      }

      if (!TIPOS_PERMITIDOS.includes(contentType)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Tipo de imagen no permitido' }),
        }
      }

      const ext = EXTENSIONES[contentType]
      const imageKey = `${altarId}/${randomUUID()}.${ext}`

      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: imageKey,
        ContentType: contentType,
      })

      const url = await getSignedUrl(s3, command, { expiresIn: 300 }) // 5 minutos

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url, imageKey }),
      }
    }

    // GET /uploads/{proxy+} - firma URL de lectura
    if (event.httpMethod === 'GET') {
      const imageKey = event.pathParameters?.proxy

      if (!imageKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Falta imageKey' }),
        }
      }

      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: imageKey,
      })

      const url = await getSignedUrl(s3, command, { expiresIn: 3600 }) // 1 hora

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ url }),
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método no permitido' }),
    }
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al procesar la solicitud' }),
    }
  }
}
