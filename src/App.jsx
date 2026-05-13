import { useEffect, useRef, useState } from 'react'
import './App.css'

const ZOOM_STEP = 0.2
const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const MAX_STAGE_WIDTH = 1000
const MAX_STAGE_HEIGHT = 700
const MAX_UPLOAD_WIDTH = 1000

function App() {
  const [image, setImage] = useState(null)
  const [cavities, setCavities] = useState([])
  const [zoom, setZoom] = useState(1)
  const [stageSize, setStageSize] = useState({ width: 1000, height: 700 })
  const [imageNaturalSize, setImageNaturalSize] = useState(null)
  const [imageResolution, setImageResolution] = useState(null)
  const [mousePosition, setMousePosition] = useState(null)
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [selectedCavityIndex, setSelectedCavityIndex] = useState(null)
  const [draggingCavityIndex, setDraggingIndex] = useState(null)
  const [resizingCavityIndex, setResizingIndex] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const getPanBounds = (nextZoom = zoom, nextStageSize = stageSize) => {
    const scaledWidth = nextStageSize.width * nextZoom
    const scaledHeight = nextStageSize.height * nextZoom

    return {
      minX: Math.min(0, nextStageSize.width - scaledWidth),
      maxX: 0,
      minY: Math.min(0, nextStageSize.height - scaledHeight),
      maxY: 0,
    }
  }

  const clampPanOffset = (offset, nextZoom = zoom, nextStageSize = stageSize) => {
    const bounds = getPanBounds(nextZoom, nextStageSize)

    return {
      x: clamp(offset.x, bounds.minX, bounds.maxX),
      y: clamp(offset.y, bounds.minY, bounds.maxY),
    }
  }

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

  useEffect(() => {
    setPanOffset((current) => clampPanOffset(current))
  }, [zoom, stageSize])

  const getPointerPosition = (e) => {
    const rect = editorRef.current.getBoundingClientRect()
    const viewportX = e.clientX - rect.left
    const viewportY = e.clientY - rect.top
    const mouseX = clamp((viewportX - panOffset.x) / zoom, 0, stageSize.width)
    const mouseY = clamp((viewportY - panOffset.y) / zoom, 0, stageSize.height)

    return { mouseX, mouseY }
  }

  const resetEditorState = () => {
    setCavities([])
    setZoom(1)
    setMousePosition(null)
    setIsRemoveMode(false)
    setSelectedCavityIndex(null)
    setPanOffset({ x: 0, y: 0 })
    setPanStart(null)
    setIsPanning(false)
    setImageNaturalSize(null)
  }

  const prepareImageForUpload = (source) =>
    new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        if (img.naturalWidth <= MAX_UPLOAD_WIDTH) {
          resolve(source)
          return
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const scale = MAX_UPLOAD_WIDTH / img.naturalWidth
        const targetWidth = Math.round(img.naturalWidth * scale)
        const targetHeight = Math.round(img.naturalHeight * scale)

        if (!ctx) {
          resolve(source)
          return
        }

        canvas.width = targetWidth
        canvas.height = targetHeight

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        resolve(canvas.toDataURL('image/png'))
      }

      img.onerror = () => reject(new Error('Failed to process uploaded image.'))
      img.src = source
    })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]

    if (!file) return

    await loadFile(file)
    e.target.value = ''
  }

  const loadFile = async (file) => {
    if (!file) return

    const reader = new FileReader()

    reader.onload = async () => {
      try {
        resetEditorState()
        const preparedImage = await prepareImageForUpload(reader.result)
        setImage(preparedImage)
      } catch (error) {
        console.error(error)
        setImage(reader.result)
      }
    }

    reader.readAsDataURL(file)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    await loadFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageNaturalSize({ width: naturalWidth, height: naturalHeight })
    setImageResolution({ width: naturalWidth, height: naturalHeight })
    setStageSize(fitImageToStage(naturalWidth, naturalHeight))
    setPanOffset({ x: 0, y: 0 })
  }

  const addCavity = () => {
    const nextIndex = cavities.length

    setCavities([
      ...cavities,
      {
        x: stageSize.width / 2,
        y: stageSize.height / 2,
        size: Math.max(48, Math.min(stageSize.width, stageSize.height) * 0.12),
      },
    ])
    setSelectedCavityIndex(nextIndex)
  }

  const removeCavity = (indexToRemove) => {
    setCavities(cavities.filter((_, index) => index !== indexToRemove))
    setSelectedCavityIndex((current) => {
      if (current === indexToRemove) return null
      if (current === null) return null
      return current > indexToRemove ? current - 1 : current
    })
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
      return
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
      return
    }

    if (isPanning && panStart) {
      const nextOffset = {
        x: panStart.originX + (e.clientX - panStart.pointerX),
        y: panStart.originY + (e.clientY - panStart.pointerY),
      }

      setPanOffset(clampPanOffset(nextOffset))
    }
  }

  const handleMouseLeave = () => {
    setMousePosition(null)
    stopActions()
  }

  const stopActions = () => {
    setDraggingIndex(null)
    setResizingIndex(null)
    setIsPanning(false)
    setPanStart(null)
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

  const editorWidth = stageSize.width
  const editorHeight = stageSize.height

  return (
    <div className="app">
      <h1>Cavity Editor</h1>

      <input
        ref={fileInputRef}
        className="sr-only-input"
        type="file"
        accept="image/*"
        onChange={handleUpload}
      />

      {image ? (
        <>
          <div className="toolbar">
            <button onClick={() => fileInputRef.current?.click()}>Upload New Image</button>

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
              onMouseDown={(e) => {
                if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return

                setSelectedCavityIndex(null)
                setIsPanning(true)
                setPanStart({
                  pointerX: e.clientX,
                  pointerY: e.clientY,
                  originX: panOffset.x,
                  originY: panOffset.y,
                })
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={stopActions}
              onMouseLeave={handleMouseLeave}
            >
              <div
                className="editor-pan"
                style={{
                  width: stageSize.width * zoom,
                  height: stageSize.height * zoom,
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                }}
              >
                <div
                  className="editor-stage"
                  style={{
                    width: stageSize.width,
                    height: stageSize.height,
                    transform: `scale(${zoom})`,
                  }}
                >
                <img
                  src={image}
                  alt="Uploaded"
                  className="main-image"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={handleImageLoad}
                  style={{
                    width: stageSize.width,
                    height: stageSize.height,
                  }}
                />

                {cavities.map((cavity, index) => (
                  <div
                    key={index}
                    className={[
                      'cavity',
                      isRemoveMode ? 'remove-mode' : '',
                      !isRemoveMode && selectedCavityIndex === index ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setSelectedCavityIndex(index)
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

                    {!isRemoveMode && selectedCavityIndex === index && (
                      <div
                        className="resize-handle"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setSelectedCavityIndex(index)
                          setResizingIndex(index)
                        }}
                      />
                    )}
                  </div>
                ))}
                </div>
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

          <form className="details-form">
            {[1, 2, 3, 4, 5, 6].map((fieldNumber) => (
              <label key={fieldNumber} className="details-form__field">
                <span>Field {fieldNumber}</span>
                <input type="text" placeholder={`Enter value ${fieldNumber}`} />
              </label>
            ))}
          </form>
        </>
      ) : (
        <button
          type="button"
          className={isDragOver ? 'upload-dropzone drag-over' : 'upload-dropzone'}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-dropzone__eyebrow">Start with an image</span>
          <span className="upload-dropzone__title">Upload or drag and drop</span>
          <span className="upload-dropzone__subtitle">
            Choose a photo to open the editor and begin placing cavities.
          </span>
          <span className="upload-dropzone__cta">Browse files</span>
        </button>
      )}
    </div>
  )
}

export default App
