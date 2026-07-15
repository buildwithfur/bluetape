import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const uiAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title'])
const files = []
const violations = []
const localeDirectory = 'src/locales'

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(file)
    else if (file.endsWith('.tsx')) files.push(file)
  }
}

function report(source, node, message) {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
  violations.push(`${source.fileName}:${line + 1}:${character + 1} ${message}`)
}

function hasWords(value) {
  return /[A-Za-z]{2}/.test(value)
}

collect('src')

const localeFiles = fs.readdirSync(localeDirectory).filter((file) => file.endsWith('.json'))
const reference = JSON.parse(
  fs.readFileSync(path.join(localeDirectory, 'en.json'), 'utf8'),
)
const referenceKeys = Object.keys(reference)

function placeholders(value) {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort()
}

for (const localeFile of localeFiles) {
  const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, localeFile), 'utf8'))
  const localeKeys = Object.keys(locale)
  for (const key of referenceKeys.filter((key) => !(key in locale))) {
    violations.push(`${localeFile}: missing locale key ${JSON.stringify(key)}`)
  }
  for (const key of localeKeys.filter((key) => !(key in reference))) {
    violations.push(`${localeFile}: unknown locale key ${JSON.stringify(key)}`)
  }
  for (const key of referenceKeys.filter((key) => key in locale)) {
    const expected = placeholders(reference[key])
    const actual = placeholders(locale[key])
    if (expected.join() !== actual.join()) {
      violations.push(
        `${localeFile}: interpolation mismatch for ${JSON.stringify(key)} ` +
          `(expected ${expected.join(', ') || 'none'}, found ${actual.join(', ') || 'none'})`,
      )
    }
  }
}

for (const file of files) {
  const contents = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  function visit(node) {
    if (ts.isJsxText(node) && hasWords(node.text.trim())) {
      report(source, node, `hard-coded JSX text: ${JSON.stringify(node.text.trim())}`)
    }

    if (
      ts.isJsxAttribute(node) &&
      uiAttributes.has(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      hasWords(node.initializer.text)
    ) {
      report(
        source,
        node,
        `hard-coded ${node.name.getText(source)}: ${JSON.stringify(node.initializer.text)}`,
      )
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'setError' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      hasWords(node.arguments[0].text)
    ) {
      report(source, node.arguments[0], `hard-coded error: ${JSON.stringify(node.arguments[0].text)}`)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
}

if (violations.length) {
  console.error('User-facing strings must use react-i18next locale keys:\n')
  console.error(violations.join('\n'))
  process.exitCode = 1
} else {
  console.log(
    `i18n audit passed (${files.length} TSX files, ${localeFiles.length} locales checked).`,
  )
}
