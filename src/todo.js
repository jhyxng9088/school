import { TodoHomePreview, useTodos as useBaseTodos } from './todo.jsx'
import { TodoPage } from './todo-stage5-ai.jsx'
import { deleteExpiredSharedTodo, writeSharedTodo } from './school-sync'

export { TodoHomePreview, TodoPage }

export function useTodos(profile) {
  const todoData = useBaseTodos(profile)

  function removeTodo(id) {
    const target = todoData.todos.find((todo) => todo.id === id)
    if (!target) return

    // Completed-item deletion stays personal to this student.
    if (target.completed) {
      todoData.removeTodo(id)
      return
    }

    // Deleting an active reminder from Edit is a class-wide deletion.
    // First move the shared document to an already-expired date so every
    // class client hides it immediately under the existing expiry logic.
    // Then physically delete the shared document when the current rules allow it.
    const tombstone = {
      ...target,
      dueDate: '1970-01-01',
      dueTime: '',
      updatedAt: Date.now(),
    }

    void writeSharedTodo(profile, tombstone)
      .then(() => deleteExpiredSharedTodo(profile, id))
      .catch((error) => {
        console.error('Class-wide reminder delete failed:', error)
      })
  }

  return {
    ...todoData,
    removeTodo,
  }
}
