// @flow
import path from "path"
import * as R from "ramda"
import glob from "glob"

import getFormat from "./formats"
import type { LinguiConfig } from "@lingui/conf"

type CatalogProps = {
  name: ?string,
  path: string,
  include: Array<string>,
  exclude: Array<string>
}

const NAME = "{name}"
const LOCALE = "{locale}"

export function Catalog(
  { name, path, include, exclude }: CatalogProps,
  config: LinguiConfig
) {
  this.name = name
  this.path = path
  this.include = include
  this.exclude = [this.localeDir, ...exclude]
  this.config = config
}

// export type MessageType = {
//   id: string,
//   translation: string,
//   defaults: ?string,
//   origin: Array<[number, string]>,
//   description: ?string,
//   comments: ?Array<string>,
//   obsolete: boolean,
//   flags: ?Array<string>
// }

Catalog.prototype = {
  collect() {
    const paths = this.sourcePaths
  },

  // 1.
  get sourcePaths() {
    return []
  },

  get localeDir() {
    const localePatternIndex = this.path.indexOf("{locale}")
    if (localePatternIndex === -1) {
      throw Error("Invalid catalog path: {locale} variable is missing")
    }
    return this.path.substr(0, localePatternIndex)
  }
}

/**
 * Parse `config.catalogs` and return a list of configured Catalog instances.
 */
export function getCatalogs(config: LinguiConfig): Array<Catalog> {
  const catalogsConfig = config.catalogs
  const catalogs = []

  Object.keys(catalogsConfig).forEach(catalogPath => {
    // Validate that `catalogPath` doesn't end with trailing slash
    if (catalogPath.endsWith(path.sep)) {
      const extension = getFormat(config.format).catalogExtension
      const correctPath = catalogPath.slice(0, -1)
      const examplePath =
        correctPath.replace(
          LOCALE,
          // Show example using one of configured locales (if any)
          (config.locales || [])[0] || "en"
        ) + extension
      throw new Error(
        `Remove trailing slash from "${catalogPath}". Catalog path isn't a directory,` +
          ` but translation file without extension. For example, catalog path "${correctPath}"` +
          ` results in translation file "${examplePath}".`
      )
    }

    const sourcePaths = ensureArray(catalogsConfig[catalogPath])

    const include = sourcePaths
      // exclude ignore patterns
      .filter(path => path[0] !== "!")
      // first exclamation mark might be escaped
      .map(path => path.replace(/^\\!/, "!"))
      .map(path => normalizeRelative(path))

    const exclude = sourcePaths
      // filter ignore patterns
      .filter(path => path[0] === "!")
      // remove exlamation mark at the beginning
      .map(path => path.slice(1))
      .map(path => normalizeRelative(path))

    // catalogPath without {name} pattern -> always refers to a single catalog
    if (!catalogPath.includes(NAME)) {
      // Validate that sourcePaths doesn't use {name} pattern either
      const invalidSource = sourcePaths.filter(path => path.includes(NAME))[0]
      if (invalidSource !== undefined) {
        throw new Error(
          `Catalog with path "${catalogPath}" doesn't have a {name} pattern in it,` +
            ` but one of source directories uses it: "${invalidSource}".` +
            ` Either add {name} pattern to "${catalogPath}" or remove it from all source directories.`
        )
      }

      // catalog name is the last directory of catalogPath.
      // If the last part is {locale}, then catalog doesn't have an explicit name
      const name = (function() {
        const _name = catalogPath.split(path.sep).slice(-1)[0]
        return _name !== LOCALE ? _name : null
      })()

      catalogs.push(
        new Catalog(
          {
            name,
            path: normalizeRelative(catalogPath),
            include,
            exclude
          },
          config
        )
      )
      return
    }

    const patterns = include.map(path => path.replace(NAME, "*"))
    const candidates = glob.sync(
      patterns.length > 1 ? `{${patterns.join(",")}` : patterns[0],
      {
        ignore: exclude
      }
    )

    candidates.forEach(catalogDir => {
      const name = path.basename(catalogDir)
      catalogs.push(
        new Catalog(
          {
            name,
            path: normalizeRelative(catalogPath.replace(NAME, name)),
            include: include.map(path => path.replace(NAME, name)),
            exclude: exclude.map(path => path.replace(NAME, name))
          },
          config
        )
      )
    })
  })

  return catalogs
}

/**
 * Ensure that value is always array. If not, turn it into an array of one element.
 */
const ensureArray = <T>(value: Array<T> | T): Array<T> =>
  Array.isArray(value) ? value : [value]

/**
 * Normalize relative paths
 *
 * Remove ./ at the beginning: ./relative  => relative
 *                             relative    => relative
 * Preserve directory paths:   ./relative/ => relative/
 * Preserve absolute paths:    /absolute/path => /absolute/path
 */
function normalizeRelative(sourcePath: string): string {
  // absolute path, do nothing
  if (sourcePath.startsWith("/")) return sourcePath

  // preserve trailing slash for directories
  const isDir = sourcePath.endsWith("/")
  return (
    path.relative(process.cwd(), path.resolve(sourcePath)) + (isDir ? "/" : "")
  )
}