// Donde se guarda el altar.
//
// ---------------------------------------------------------------------
//  VERSION DE LA NUBE
// ---------------------------------------------------------------------
//
// Este archivo se comunica con la API en AWS. Las cuatro funciones mantienen
// su firma igual que en la version de navegador, asi que los componentes no
// cambian ni una linea.
//
// El altarId sale del hostname de la pagina, para que la misma URL abra el
// mismo altar en cualquier dispositivo.

import { setTradicional } from '../catalogo/elementos.js'
import { reducirABlob } from '../lib/imagen.js'

// Modo de la nube: el banner de la pagina dice la verdad
export const MODO = 'nube'

const LLAVE_NOMBRE = 'ofrenda:nombre'
const LLAVE_ELEMENTOS = 'ofrenda:elementos'

// La URL de la API sale de la variable de entorno, sin diagonal final
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '')

// El altarId sale del hostname: asi la laptop y el telefono ven el mismo altar
const altarId = window.location.hostname

/** Todos los elementos del altar, ordenados por cuando se pusieron. */
export async function listar() {
  try {
    const respuesta = await fetch(`${API_URL}/elements?altarId=${encodeURIComponent(altarId)}`)
    if (!respuesta.ok) {
      throw new Error(`Error ${respuesta.status}`)
    }
    const datos = await respuesta.json()
    const elementos = datos.elementos || []

    // En la primera carga, si la API esta vacia, importar de localStorage
    if (elementos.length === 0) {
      await importarDesdeNavegador()
      // Volver a listar para devolver lo que se importo
      const respuesta2 = await fetch(`${API_URL}/elements?altarId=${encodeURIComponent(altarId)}`)
      if (respuesta2.ok) {
        const datos2 = await respuesta2.json()
        return datos2.elementos || []
      }
    }

    return elementos
  } catch (error) {
    console.error('Error al listar elementos:', error)
    return []
  }
}

/**
 * Agrega un elemento y devuelve como quedo guardado.
 *
 * Si trae `imagen` (el File del formulario), aqui se reduce y se sube a S3.
 * El componente nunca sabe que paso con el archivo: solo lo entrega.
 */
export async function agregar(elemento) {
  try {
    const { imagen, ...resto } = elemento

    let imageKey
    if (imagen) {
      // Pedir URL firmada para subir
      const firmaResp = await fetch(`${API_URL}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          altarId,
          contentType: imagen.type,
        }),
      })

      if (!firmaResp.ok) {
        throw new Error('No pude obtener URL de subida')
      }

      const { url, imageKey: key } = await firmaResp.json()
      imageKey = key

      // Subir la imagen reducida
      const blob = await reducirABlob(imagen)
      const subirResp = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': imagen.type },
        body: blob,
      })

      if (!subirResp.ok) {
        throw new Error('No pude subir la imagen')
      }
    }

    // Agregar el elemento a la API
    const cuerpo = {
      altarId,
      ...resto,
    }
    if (imageKey) {
      cuerpo.imageKey = imageKey
    }

    const respuesta = await fetch(`${API_URL}/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })

    if (!respuesta.ok) {
      throw new Error(`Error ${respuesta.status}`)
    }

    return await respuesta.json()
  } catch (error) {
    console.error('Error al agregar elemento:', error)
    throw error
  }
}

/** Quita un elemento del altar. */
export async function borrar(id) {
  try {
    const respuesta = await fetch(`${API_URL}/elements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        altarId,
        borrar: true,
        id,
      }),
    })

    if (!respuesta.ok) {
      throw new Error(`Error ${respuesta.status}`)
    }
  } catch (error) {
    console.error('Error al borrar elemento:', error)
    throw error
  }
}

/**
 * De donde sale la imagen de un elemento.
 *
 * En la nube devuelve la URL firmada de S3. El elemento solo guarda su imageKey.
 */
export async function urlDeImagen(elemento) {
  if (!elemento.imageKey) {
    return null
  }

  try {
    const respuesta = await fetch(`${API_URL}/uploads/${elemento.imageKey}`)
    if (!respuesta.ok) {
      return null
    }
    const datos = await respuesta.json()
    return datos.url
  } catch (error) {
    console.error('Error al obtener URL de imagen:', error)
    return null
  }
}

/** Quien esta poniendo cosas en el altar. Se pregunta una sola vez. */
export function nombre() {
  return localStorage.getItem(LLAVE_NOMBRE) || ''
}

export function guardarNombre(valor) {
  localStorage.setItem(LLAVE_NOMBRE, valor.slice(0, 40))
}

/**
 * Importa los elementos que ya existen en localStorage a la API.
 * Solo se ejecuta en la primera carga desde la laptop, si la API esta vacia.
 */
async function importarDesdeNavegador() {
  try {
    const crudo = localStorage.getItem(LLAVE_ELEMENTOS)
    if (!crudo) {
      // No hay nada que importar, poner el set tradicional
      const semilla = setTradicional()
      for (const elem of semilla) {
        await agregar(elem)
      }
      return
    }

    const lista = JSON.parse(crudo)
    if (!Array.isArray(lista) || lista.length === 0) {
      return
    }

    // Importar cada elemento, incluidas las imagenes
    for (const elem of lista) {
      const { imagenLocal, ...resto } = elem

      // Si tiene imagenLocal (data URL), convertirla a Blob y subirla
      if (imagenLocal) {
        try {
          const respBlob = await fetch(imagenLocal)
          const blob = await respBlob.blob()
          const file = new File([blob], 'imagen.jpg', { type: 'image/jpeg' })
          await agregar({ ...resto, imagen: file })
        } catch {
          // Si falla la conversion, agregar sin imagen
          await agregar(resto)
        }
      } else {
        await agregar(resto)
      }
    }
  } catch (error) {
    console.error('Error al importar desde localStorage:', error)
  }
}
