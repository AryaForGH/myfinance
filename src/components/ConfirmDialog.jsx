import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../context/I18nContext.js'
import { useToast } from '../context/useToast.js'

function ConfirmDialog({ title, description, onCancel, onConfirm }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (confirmError) {
      setError(confirmError.message || t('common.deleteFailed'))
      notify('error', confirmError.message || t('common.deleteFailed'))
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog glass-panel"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <span className="confirm-dialog-icon" aria-hidden="true">!</span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="confirm-dialog-actions">
          <button className="secondary-button" disabled={busy} onClick={onCancel} ref={cancelRef} type="button">
            {t('common.cancel')}
          </button>
          <button className="danger-button" disabled={busy} onClick={confirm} type="button">
            {busy && <span className="inline-spinner" aria-hidden="true" />}
            {busy ? t('confirm.deleting') : t('confirm.delete')}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmDialog
