import { useEffect, useRef, useState } from 'react'
import './App.css'

const ZOOM_STEP = 0.2
const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const MAX_STAGE_WIDTH = 1000
const MAX_STAGE_HEIGHT = 700
const UPLOAD_QUALITY_PERCENT = 8

function App() {
  const [image, setImage] = useState(null)
  const [cavities, setCavities] = useState([])
  const [zoom, setZoom] = useState(1)
  const [stageSize, setStageSize] = useState({ width: 1000, height: 700 })
  const [imageNaturalSize, setImageNaturalSize] = useState(null)
  const [imageResolution, setImageResolution] = useState(null)
  const [mousePosition, setMousePosition] = useState(null)
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [draggingCavityIndex, setDraggingIndex] = useState(null)
  const [resizingCavityIndex, setResizingIndex] = useState(null)

  const editorRef = useRef(null)

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const uploadQuality = clamp(UPLOAD_QUALITY_PERCENT / 100, 0.05, 1)

  const fitImageToStage = (width, height) => {
    if (!width || !height) {
      return { width: 1000, height: 700 }
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : MAX_STAGE_WIDTH
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : MAX_STAGE_HEIGHT
    const availableWidth = Math.min(MAX_STAGE_WIDTH, Math.max(viewportWidth - 80, 240))
    const availableHeight = Math.min(MAX_STAGE_HEIGHT, Math.max(viewportHeight - 260, 240))
    const ratio = Math.min(availableWidth / width, availableHeight / height, 1)

    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    }
  }

  useEffect(() => {
    if (!imageNaturalSize) return

    const updateStageSize = () => {
      setStageSize(fitImageToStage(imageNaturalSize.width, imageNaturalSize.height))
    }

    updateStageSize()
    window.addEventListener('resize', updateStageSize)

    return () => {
      window.removeEventListener('resize', updateStageSize)
    }
  }, [imageNaturalSize])

  const getPointerPosition = (e) => {
    const rect = editorRef.current.getBoundingClientRect()
    const mouseX = clamp((e.clientX - rect.left) / zoom, 0, stageSize.width)
    const mouseY = clamp((e.clientY - rect.top) / zoom, 0, stageSize.height)

    return { mouseX, mouseY }
  }

  const resetEditorState = () => {
    setCavities([])
    setZoom(1)
    setMousePosition(null)
    setIsRemoveMode(false)
    setImageNaturalSize(null)
  }

  const compressImage = (source) =>
    new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        if (!ctx) {
          resolve(source)
          return
        }

        ctx.drawImage(img, 0, 0)

        const compressed = canvas.toDataURL('image/jpeg', uploadQuality)
        resolve(compressed)
      }

      img.onerror = () => reject(new Error('Failed to compress uploaded image.'))
      img.src = source
    })

  const handleUpload = async (e) => {
    const file = e.target.files[0]

    if (!file) return

    const reader = new FileReader()

    reader.onload = async () => {
      try {
        resetEditorState()
        const compressedImage = await compressImage(reader.result)
        setImage(compressedImage)
      } catch (error) {
        console.error(error)
        setImage(reader.result)
      }
    }

    reader.readAsDataURL(file)
  }

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageNaturalSize({ width: naturalWidth, height: naturalHeight })
    setImageResolution({ width: naturalWidth, height: naturalHeight })
    setStageSize(fitImageToStage(naturalWidth, naturalHeight))
  }

  const addCavity = () => {
    setCavities([
      ...cavities,
      {
        x: stageSize.width / 2,
        y: stageSize.height / 2,
        size: Math.max(48, Math.min(stageSize.width, stageSize.height) * 0.12),
      },
    ])
  }

  const removeCavity = (indexToRemove) => {
    setCavities(cavities.filter((_, index) => index !== indexToRemove))
  }

  const handleMouseMove = (e) => {
    if (!image) return

    const { mouseX, mouseY } = getPointerPosition(e)
    setMousePosition({
      x: Math.round(mouseX),
      y: Math.round(mouseY),
    })

    if (draggingCavityIndex !== null) {
      const updated = [...cavities]
      const cavity = updated[draggingCavityIndex]
      const radius = cavity.size / 2

      cavity.x = clamp(mouseX, radius, stageSize.width - radius)
      cavity.y = clamp(mouseY, radius, stageSize.height - radius)

      setCavities(updated)
    }

    if (resizingCavityIndex !== null) {
      const updated = [...cavities]
      const cavity = updated[resizingCavityIndex]
      const dx = mouseX - cavity.x
      const dy = mouseY - cavity.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const maxRadius = Math.min(
        cavity.x,
        cavity.y,
        stageSize.width - cavity.x,
        stageSize.height - cavity.y
      )

      cavity.size = clamp(distance * 2, 36, maxRadius * 2)

      setCavities(updated)
    }
  }

  const handleMouseLeave = () => {
    setMousePosition(null)
    setDraggingIndex(null)
    setResizingIndex(null)
  }

  const stopActions = () => {
    setDraggingIndex(null)
    setResizingIndex(null)
  }

  const zoomIn = () => setZoom((current) => clamp(current + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
  const zoomOut = () => setZoom((current) => clamp(current - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))

  const downloadImage = () => {
    if (!image || !imageResolution) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      const scaleX = img.width / stageSize.width
      const scaleY = img.height / stageSize.height

      canvas.width = img.width
      canvas.height = img.height

      ctx.drawImage(img, 0, 0)

      cavities.forEach((cavity) => {
        ctx.beginPath()
        ctx.arc(
          cavity.x * scaleX,
          cavity.y * scaleY,
          (cavity.size * scaleX) / 2,
          0,
          Math.PI * 2
        )
        ctx.fillStyle = 'rgba(255, 244, 163, 0.42)'
        ctx.fill()
        ctx.lineWidth = 4
        ctx.strokeStyle = '#f2cf4a'
        ctx.stroke()
      })

      const link = document.createElement('a')
      link.download = 'final-image.png'
      link.href = canvas.toDataURL()
      link.click()
    }

    img.src = image
  }

  const editorWidth = Math.round(stageSize.width * zoom)
  const editorHeight = Math.round(stageSize.height * zoom)

  return (
    <div className="app">
      <h1>Cavity Editor</h1>

      <div className="toolbar">
        <input type="file" accept="image/*" onChange={handleUpload} />

        <button onClick={addCavity} disabled={!image}>
          Add Cavity
        </button>

        <button
          className={isRemoveMode ? 'danger-button active' : 'danger-button'}
          onClick={() => setIsRemoveMode((current) => !current)}
          disabled={!image || cavities.length === 0}
        >
          {isRemoveMode ? 'Done Removing' : 'Remove'}
        </button>

        <button onClick={downloadImage} disabled={!image}>
          Download
        </button>
      </div>

      <div className="editor-shell">
        <div
          className="editor"
          ref={editorRef}
          style={{
            width: editorWidth,
            height: editorHeight,
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={stopActions}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="editor-stage"
            style={{
              width: stageSize.width,
              height: stageSize.height,
              transform: `scale(${zoom})`,
            }}
          >
            {image ? (
              <img
                src={image}
                alt="Uploaded"
                className="main-image"
                onLoad={handleImageLoad}
                style={{
                  width: stageSize.width,
                  height: stageSize.height,
                }}
              />
            ) : (
              <div className="empty-state">Upload a photo to start placing cavities.</div>
            )}

            {image &&
              cavities.map((cavity, index) => (
                <div
                  key={index}
                  className={isRemoveMode ? 'cavity remove-mode' : 'cavity'}
                  onMouseDown={() => {
                    if (isRemoveMode) return
                    setDraggingIndex(index)
                  }}
                  style={{
                    width: cavity.size,
                    height: cavity.size,
                    left: cavity.x - cavity.size / 2,
                    top: cavity.y - cavity.size / 2,
                  }}
                >
                  {isRemoveMode && (
                    <button
                      className="remove-cavity"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeCavity(index)
                      }}
                    >
                      x
                    </button>
                  )}

                  {!isRemoveMode && (
                    <div
                      className="resize-handle"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setResizingIndex(index)
                      }}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>

        <div className="status-chip resolution-chip">
          {imageResolution
            ? `Resolution: ${imageResolution.width} x ${imageResolution.height}`
            : 'Resolution: -'}
        </div>

        <div className="bottom-right-panel">
          <div className="status-chip position-chip">
            {mousePosition ? `X: ${mousePosition.x}, Y: ${mousePosition.y}` : 'X: -, Y: -'}
          </div>

          <div className="zoom-controls">
            <button onClick={zoomOut} disabled={!image || zoom <= MIN_ZOOM}>
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} disabled={!image || zoom >= MAX_ZOOM}>
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
