import fs from 'node:fs'

const path = 'src/main.jsx'
let value = fs.readFileSync(path, 'utf8')

function replaceOnce(from, to, label) {
  const first = value.indexOf(from)
  if (first < 0) throw new Error(`Missing guard: ${label}`)
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`Non-unique guard: ${label}`)
  value = value.slice(0, first) + to + value.slice(first + from.length)
}

replaceOnce(
  'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence }) {',
  'function Home({ name, now, weeklySchedule, overrides, schoolData, todoData, presence, academicData }) {',
  'Home academicData prop',
)

replaceOnce(
`        todoData={todoData}
        presence={presence}
      />`,
`        todoData={todoData}
        presence={presence}
        academicData={academicData}
      />`,
  'Home academicData pass-through',
)

fs.writeFileSync(path, value)
console.log('final collaboration runtime guard applied')
