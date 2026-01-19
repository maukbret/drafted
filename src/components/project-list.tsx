'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Project {
  id: string
  name: string | null
  status: string
  created_at: string
  klaviyo_connections: {
    account_name: string | null
  } | null
}

interface ProjectListProps {
  projects: Project[]
}

export function ProjectList({ projects: initialProjects }: ProjectListProps) {
  const [projects, setProjects] = useState(initialProjects)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm('Are you sure you want to delete this import?')) return

    setDeletingId(id)

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      setProjects(projects.filter(p => p.id !== id))
      router.refresh()
    } catch (err) {
      alert('Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No imports yet. Create your first one above.
      </p>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-gray-800">
      {projects.map((project) => (
        <div
          key={project.id}
          className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        >
          <Link
            href={`/template-importer/email/${project.id}`}
            className="min-w-0 flex-1"
          >
            <p className="font-medium truncate">
              {project.name || 'Untitled'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {project.klaviyo_connections?.account_name || 'Unknown account'}
            </p>
          </Link>
          <div className="flex items-center gap-4 ml-4">
            <span className={`text-xs px-2 py-1 rounded-full ${
              project.status === 'exported'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : project.status === 'ready'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                : project.status === 'error'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}>
              {project.status}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(project.created_at).toLocaleDateString('en-GB')}
            </span>
            <button
              onClick={(e) => deleteProject(project.id, e)}
              disabled={deletingId === project.id}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
            >
              {deletingId === project.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}