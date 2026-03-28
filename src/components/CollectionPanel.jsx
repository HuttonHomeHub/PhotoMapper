import { useState } from 'react'

const PRESET_COLORS = ['#e94560', '#3a86ff', '#8ecae6', '#06d6a0', '#ffb703']

export default function CollectionPanel({ collections, activeCollectionId, onSelect, onCreate, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(true)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  function handleCreate() {
    if (!newName.trim()) return
    onCreate({ name: newName.trim(), color: newColor })
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    setCreatingNew(false)
  }

  function handleCancelCreate() {
    setNewName('')
    setNewColor(PRESET_COLORS[0])
    setCreatingNew(false)
  }

  function handleStartRename(collection, e) {
    e.stopPropagation()
    setRenamingId(collection.id)
    setRenameValue(collection.name)
  }

  function handleRename(id) {
    if (!renameValue.trim()) return
    onUpdate(id, { name: renameValue.trim() })
    setRenamingId(null)
    setRenameValue('')
  }

  function handleCancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  function handleRowClick(id) {
    onSelect(activeCollectionId === id ? null : id)
  }

  return (
    <div className="collection-panel">
      <div className="collection-panel-header">
        <span className="collection-panel-title">Collections</span>
        <div className="collection-panel-header-btns">
          <button
            className="collection-panel-add"
            onClick={() => { setCreatingNew(true); setExpanded(true) }}
            aria-label="New collection"
            title="New collection"
          >+</button>
          <button
            className="collection-panel-chevron"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="collection-panel-body">
          {creatingNew && (
            <div className="collection-new-form">
              <input
                className="collection-new-input"
                type="text"
                placeholder="Collection name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') handleCancelCreate() }}
                autoFocus
              />
              <div className="collection-color-picker">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-swatch${newColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="collection-new-form-actions">
                <button className="collection-save-btn" onClick={handleCreate}>Save</button>
                <button className="collection-cancel-btn" onClick={handleCancelCreate}>Cancel</button>
              </div>
            </div>
          )}

          <div
            className={`collection-item${activeCollectionId === null ? ' active' : ''}`}
            onClick={() => onSelect(null)}
          >
            <span className="collection-dot" style={{ background: '#888' }} />
            <span className="collection-name">All Photos</span>
          </div>

          {collections.map(col => (
            <div
              key={col.id}
              className={`collection-item${activeCollectionId === col.id ? ' active' : ''}`}
              onClick={() => renamingId !== col.id && handleRowClick(col.id)}
            >
              <span className="collection-dot" style={{ background: col.color }} />

              {renamingId === col.id ? (
                <input
                  className="collection-rename-input"
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(col.id); if (e.key === 'Escape') handleCancelRename() }}
                  onBlur={() => handleRename(col.id)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="collection-name">{col.name}</span>
              )}

              <span className="collection-count">{col.photoCount}</span>

              <span className="collection-actions">
                <button
                  className="collection-rename-btn"
                  onClick={e => handleStartRename(col, e)}
                  aria-label={`Rename ${col.name}`}
                  title="Rename"
                >&#9998;</button>
                <button
                  className="collection-delete-btn"
                  onClick={e => { e.stopPropagation(); onDelete(col.id) }}
                  aria-label={`Delete ${col.name}`}
                  title="Delete"
                >&#215;</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
