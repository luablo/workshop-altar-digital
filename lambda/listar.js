// Handler para GET /elements?altarId=...
//
// Lista todos los elementos de un altar con un Query por altarId, nunca con
// Scan. Los devuelve en el orden en que se pusieron (la sk empieza con la
// fecha ISO, que ordena como texto).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLA = process.env.TABLA

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    const altarId = event.queryStringParameters?.altarId
    if (!altarId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Falta altarId' }),
      }
    }

    const resultado = await client.send(
      new QueryCommand({
        TableName: TABLA,
        KeyConditionExpression: 'altarId = :altarId',
        ExpressionAttributeValues: {
          ':altarId': altarId,
        },
        ScanIndexForward: true,
        Limit: 200,
      })
    )

    // Quitar sk antes de devolver
    const elementos = (resultado.Items || []).map(({ sk, ...resto }) => resto)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ elementos }),
    }
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error al listar elementos' }),
    }
  }
}
