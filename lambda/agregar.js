// Handler para POST /elements
//
// Agrega un elemento nuevo o borra uno existente si viene borrar: true.
// Filtra los campos permitidos y calcula posicion, id, creadoEn y sk.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLA = process.env.TABLA

const CAMPOS_PERMITIDOS = ['tipo', 'nivel', 'texto', 'link', 'puestoPor', 'imageKey']

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { altarId, borrar, id } = body

    if (!altarId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Falta altarId' }),
      }
    }

    // Borrar elemento
    if (borrar && id) {
      // Buscar el elemento para obtener su sk
      const resultado = await client.send(
        new QueryCommand({
          TableName: TABLA,
          KeyConditionExpression: 'altarId = :altarId',
          FilterExpression: 'id = :id',
          ExpressionAttributeValues: {
            ':altarId': altarId,
            ':id': id,
          },
          Limit: 1,
        })
      )

      if (!resultado.Items || resultado.Items.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Elemento no encontrado' }),
        }
      }

      const elemento = resultado.Items[0]
      await client.send(
        new DeleteCommand({
          TableName: TABLA,
          Key: {
            altarId: altarId,
            sk: elemento.sk,
          },
        })
      )

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ borrado: id }),
      }
    }

    // Agregar elemento nuevo
    const { tipo } = body
    if (!tipo) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Falta tipo' }),
      }
    }

    // Filtrar solo los campos permitidos
    const elemento = {}
    for (const campo of CAMPOS_PERMITIDOS) {
      if (body[campo] !== undefined) {
        elemento[campo] = body[campo]
      }
    }

    // Contar cuántos elementos hay en este nivel para calcular posicion
    const nivel = elemento.nivel || 1
    const enNivel = await client.send(
      new QueryCommand({
        TableName: TABLA,
        KeyConditionExpression: 'altarId = :altarId',
        FilterExpression: 'nivel = :nivel',
        ExpressionAttributeValues: {
          ':altarId': altarId,
          ':nivel': nivel,
        },
      })
    )
    const posicion = (enNivel.Items || []).length

    // Generar id, creadoEn y sk
    const nuevoId = randomUUID()
    const creadoEn = new Date().toISOString()
    const sk = `${creadoEn}#${nuevoId}`

    const nuevoElemento = {
      altarId,
      sk,
      id: nuevoId,
      creadoEn,
      posicion,
      ...elemento,
    }

    await client.send(
      new PutCommand({
        TableName: TABLA,
        Item: nuevoElemento,
      })
    )

    // Devolver sin sk
    const { sk: _, ...respuesta } = nuevoElemento

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(respuesta),
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
