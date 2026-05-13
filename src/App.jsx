import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const ZOOM_STEP = 0.2
const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const MAX_STAGE_WIDTH = 1000
const MAX_STAGE_HEIGHT = 700
const MAX_UPLOAD_WIDTH = 1000
const DEFAULT_CAVITY_SIZE = 72
const DEFAULT_COLUMN_SPACING = 96
const DEFAULT_ROW_SPACING = 92

function App() {
  const [image, setImage] = useState(null)
  const [cavities, setCavities] = useState([])
  const [zoom, setZoom] = useState(1)
  const [stageSize, setStageSize] = useState({ width: 1000, height: 700 })
  const [imageNaturalSize, setImageNaturalSize] = useState(null)
  const [imageResolution, setImageResolution] = useState(null)
  const [mousePosition, setMousePosition] = useState(null)
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [selectedCavityIndices, setSelectedCavityIndices] = useState([])
  const [draggingSelection, setDraggingSelection] = useState(null)
  const [resizingCavityIndex, setResizingIndex] = useState(null)
  const [groupResizeState, setGroupResizeState] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  const [selectionStart, setSelectionStart] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [cavityShape, setCavityShape] = useState('round')
  const [batchCount, setBatchCount] = useState(2)
  const [batchLayout, setBatchLayout] = useState('paired')
  const [batchSpacing, setBatchSpacing] = useState({
    column: DEFAULT_COLUMN_SPACING,
    row: DEFAULT_ROW_SPACING,
  })

  const editorRef = useRef(null)
  const fileInputRef = useRef(null)

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

  const fitImageToStage = (width, height) => {
    if (!width || !height) {
      return { width: 1000, height: 700 }
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : MAX_STAGE_WIDTH
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : MAX_STAGE_HEIGHT
    const availableWidth = Math.min(MAX_STAGE_WIDTH, Math.max(viewportWidth - 80, 240))
    const availableHeight = Math.min(MAX_STAGE_HEIGHT, Math.max(viewportHeight - 320, 240))
    const ratio = Math.min(availableWidth / width, availableHeight / height, 1)

    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    }
  }

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

  const sortIndicesForConnectorLayout = (indices) =>
    [...indices].sort((a, b) => {
      const cavityA = cavities[a]
      const cavityB = cavities[b]

      if (!cavityA || !cavityB) return 0
      if (Math.abs(cavityA.x - cavityB.x) > 2) return cavityA.x - cavityB.x
      return cavityA.y - cavityB.y
    })

  const inferSpacingFromSelection = (indices) => {
    const sorted = sortIndicesForConnectorLayout(indices)

    if (sorted.length < 2) {
      return {
        column: DEFAULT_COLUMN_SPACING,
        row: DEFAULT_ROW_SPACING,
      }
    }

    let inferredRow = DEFAULT_ROW_SPACING
    let inferredColumn = DEFAULT_COLUMN_SPACING
    const topColumns = []

    for (let i = 0; i < sorted.length; i += 2) {
      const top = cavities[sorted[i]]
      const bottom = cavities[sorted[i + 1]]

      if (top) topColumns.push(top.x)
      if (top && bottom) {
        inferredRow = Math.max(24, Math.round(Math.abs(bottom.y - top.y)))
      }
    }

    if (topColumns.length > 1) {
      inferredColumn = Math.max(24, Math.round(topColumns[1] - topColumns[0]))
    }

    return {
      column: inferredColumn,
      row: inferredRow,
    }
  }

  const inferLayoutFromSelection = (indices) => {
    const selected = indices.map((index) => cavities[index]).filter(Boolean)

    if (selected.length < 2) return 'paired'

    const sameRow = selected.every((cavity) => Math.abs(cavity.y - selected[0].y) < 6)
    if (sameRow) return 'horizontal'

    const sameColumn = selected.every((cavity) => Math.abs(cavity.x - selected[0].x) < 6)
    if (sameColumn) return 'vertical'

    return 'paired'
  }

  const getSelectionBounds = (indices) => {
    const selected = indices.map((index) => cavities[index]).filter(Boolean)
    if (selected.length === 0) return null

    return {
      minX: Math.min(...selected.map((cavity) => cavity.x - cavity.size / 2)),
      maxX: Math.max(...selected.map((cavity) => cavity.x + cavity.size / 2)),
      minY: Math.min(...selected.map((cavity) => cavity.y - cavity.size / 2)),
      maxY: Math.max(...selected.map((cavity) => cavity.y + cavity.size / 2)),
    }
  }

  const activeSingleSelection =
    selectedCavityIndices.length === 1 ? selectedCavityIndices[0] : null
  const hasGroupSelection = selectedCavityIndices.length > 1

  const selectedGroupBounds = useMemo(() => {
    if (!hasGroupSelection) return null
    return getSelectionBounds(selectedCavityIndices)
  }, [cavities, hasGroupSelection, selectedCavityIndices])

  const groupToolbarPosition = useMemo(() => {
    if (!hasGroupSelection) return null

    const selected = selectedCavityIndices
      .map((index) => cavities[index])
      .filter(Boolean)

    if (selected.length < 2) return null

    const left = Math.min(...selected.map((cavity) => cavity.x - cavity.size / 2))
    const top = Math.min(...selected.map((cavity) => cavity.y - cavity.size / 2))

    return {
      left: clamp(left * zoom + panOffset.x, 16, Math.max(16, stageSize.width - 180)),
      top: clamp(top * zoom + panOffset.y - 62, 16, Math.max(16, stageSize.height - 64)),
    }
  }, [cavities, hasGroupSelection, panOffset.x, panOffset.y, selectedCavityIndices, stageSize, zoom])

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

  useEffect(() => {
    if (selectedCavityIndices.length > 1) {
      setBatchSpacing(inferSpacingFromSelection(selectedCavityIndices))
      setBatchLayout(inferLayoutFromSelection(selectedCavityIndices))
    }
  }, [selectedCavityIndices])

  const getPointerPosition = (e) => {
    const rect = editorRef.current.getBoundingClientRect()
    const viewportX = e.clientX - rect.left
    const viewportY = e.clientY - rect.top
    const mouseX = clamp((viewportX - panOffset.x) / zoom, 0, stageSize.width)
    const mouseY = clamp((viewportY - panOffset.y) / zoom, 0, stageSize.height)

    return { mouseX, mouseY, viewportX, viewportY }
  }

  const resetEditorState = () => {
    setCavities([])
    setZoom(1)
    setMousePosition(null)
    setIsRemoveMode(false)
    setSelectedCavityIndices([])
    setPanOffset({ x: 0, y: 0 })
    setPanStart(null)
    setIsPanning(false)
    setDraggingSelection(null)
    setSelectionBox(null)
    setSelectionStart(null)
    setResizingIndex(null)
    setGroupResizeState(null)
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

  const createCavity = (x, y, shape = cavityShape) => ({
    x,
    y,
    shape,
    size: Math.max(48, Math.min(stageSize.width, stageSize.height, DEFAULT_CAVITY_SIZE)),
  })

  const layoutBatchSequence = (count, shape = cavityShape, layout = batchLayout) => {
    const safeCount = clamp(Number(count) || 1, 1, 200)

    if (layout === 'horizontal') {
      const horizontalSpan = (safeCount - 1) * batchSpacing.column
      const startX = clamp(
        stageSize.width / 2 - horizontalSpan / 2,
        36,
        Math.max(36, stageSize.width - horizontalSpan - 36)
      )
      const y = stageSize.height / 2

      return Array.from({ length: safeCount }, (_, index) =>
        createCavity(startX + index * batchSpacing.column, y, shape)
      )
    }

    if (layout === 'vertical') {
      const verticalSpan = (safeCount - 1) * batchSpacing.row
      const x = stageSize.width / 2
      const startY = clamp(
        stageSize.height / 2 - verticalSpan / 2,
        36,
        Math.max(36, stageSize.height - verticalSpan - 36)
      )

      return Array.from({ length: safeCount }, (_, index) =>
        createCavity(x, startY + index * batchSpacing.row, shape)
      )
    }

    const columns = Math.ceil(safeCount / 2)
    const horizontalSpan = (columns - 1) * batchSpacing.column
    const startX = clamp(
      stageSize.width / 2 - horizontalSpan / 2,
      36,
      Math.max(36, stageSize.width - horizontalSpan - 36)
    )
    const startY = clamp(stageSize.height / 2 - batchSpacing.row / 2, 36, stageSize.height - 36)

    return Array.from({ length: safeCount }, (_, index) => {
      const columnIndex = Math.floor(index / 2)
      const rowIndex = index % 2

      return createCavity(
        startX + columnIndex * batchSpacing.column,
        startY + rowIndex * batchSpacing.row,
        shape
      )
    })
  }

  const addCavities = () => {
    const nextCavities = layoutBatchSequence(batchCount, cavityShape, batchLayout)
    const startIndex = cavities.length

    setCavities([...cavities, ...nextCavities])
    setSelectedCavityIndices(nextCavities.map((_, index) => startIndex + index))
  }

  const removeCavity = (indexToRemove) => {
    setCavities(cavities.filter((_, index) => index !== indexToRemove))
    setSelectedCavityIndices((current) =>
      current
        .filter((index) => index !== indexToRemove)
        .map((index) => (index > indexToRemove ? index - 1 : index))
    )
  }

  const repositionSelection = (indices, nextSpacing = batchSpacing, layout = batchLayout) => {
    const bounds = getSelectionBounds(indices)
    if (!bounds) return

    const sorted = sortIndicesForConnectorLayout(indices)

    setCavities((current) => {
      const updated = [...current]

      sorted.forEach((index, itemIndex) => {
        const cavity = updated[index]
        if (!cavity) return

        const radius = cavity.size / 2
        let nextX = bounds.minX + radius
        let nextY = bounds.minY + radius

        if (layout === 'horizontal') {
          nextX = bounds.minX + radius + itemIndex * nextSpacing.column
        } else if (layout === 'vertical') {
          nextY = bounds.minY + radius + itemIndex * nextSpacing.row
        } else {
          const columnIndex = Math.floor(itemIndex / 2)
          const rowIndex = itemIndex % 2
          nextX = bounds.minX + radius + columnIndex * nextSpacing.column
          nextY = bounds.minY + radius + rowIndex * nextSpacing.row
        }

        updated[index] = {
          ...cavity,
          x: clamp(nextX, radius, stageSize.width - radius),
          y: clamp(nextY, radius, stageSize.height - radius),
        }
      })

      return updated
    })
  }

  const updateBatchSpacing = (key, value) => {
    const nextSpacing = {
      ...batchSpacing,
      [key]: Number(value),
    }

    setBatchSpacing(nextSpacing)

    if (selectedCavityIndices.length > 1) {
      repositionSelection(selectedCavityIndices, nextSpacing, batchLayout)
    }
  }

  const updateBatchLayout = (layout) => {
    setBatchLayout(layout)

    if (selectedCavityIndices.length > 1) {
      repositionSelection(selectedCavityIndices, batchSpacing, layout)
    }
  }

  const toggleSelectedShape = (shape) => {
    if (selectedCavityIndices.length === 0) {
      setCavityShape(shape)
      return
    }

    setCavities((current) =>
      current.map((cavity, index) =>
        selectedCavityIndices.includes(index) ? { ...cavity, shape } : cavity
      )
    )
  }

  const handleMouseMove = (e) => {
    if (!image) return

    const { mouseX, mouseY, viewportX, viewportY } = getPointerPosition(e)
    setMousePosition({
      x: Math.round(mouseX),
      y: Math.round(mouseY),
    })

    if (draggingSelection) {
      const dx = mouseX - draggingSelection.pointerX
      const dy = mouseY - draggingSelection.pointerY

      let minDx = -Infinity
      let maxDx = Infinity
      let minDy = -Infinity
      let maxDy = Infinity

      draggingSelection.items.forEach(({ cavity }) => {
        const radius = cavity.size / 2
        minDx = Math.max(minDx, radius - cavity.x)
        maxDx = Math.min(maxDx, stageSize.width - radius - cavity.x)
        minDy = Math.max(minDy, radius - cavity.y)
        maxDy = Math.min(maxDy, stageSize.height - radius - cavity.y)
      })

      const safeDx = clamp(dx, minDx, maxDx)
      const safeDy = clamp(dy, minDy, maxDy)

      setCavities((current) => {
        const updated = [...current]

        draggingSelection.items.forEach(({ index, cavity }) => {
          updated[index] = {
            ...cavity,
            x: cavity.x + safeDx,
            y: cavity.y + safeDy,
          }
        })

        return updated
      })
      return
    }

    if (resizingCavityIndex !== null) {
      setCavities((current) => {
        const updated = [...current]
        const cavity = updated[resizingCavityIndex]
        if (!cavity) return current

        const dx = mouseX - cavity.x
        const dy = mouseY - cavity.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxRadius = Math.min(
          cavity.x,
          cavity.y,
          stageSize.width - cavity.x,
          stageSize.height - cavity.y
        )

        updated[resizingCavityIndex] = {
          ...cavity,
          size: clamp(distance * 2, 36, maxRadius * 2),
        }

        return updated
      })
      return
    }

    if (groupResizeState) {
      const dx = mouseX - groupResizeState.pointerX
      const dy = mouseY - groupResizeState.pointerY
      const delta = Math.max(dx, dy)

      setCavities((current) => {
        const updated = [...current]

        groupResizeState.items.forEach(({ index, cavity }) => {
          const maxRadius = Math.min(
            cavity.x,
            cavity.y,
            stageSize.width - cavity.x,
            stageSize.height - cavity.y
          )

          updated[index] = {
            ...cavity,
            size: clamp(cavity.size + delta, 36, maxRadius * 2),
          }
        })

        return updated
      })
      return
    }

    if (isPanning && panStart) {
      const nextOffset = {
        x: panStart.originX + (e.clientX - panStart.pointerX),
        y: panStart.originY + (e.clientY - panStart.pointerY),
      }

      setPanOffset(clampPanOffset(nextOffset))
      return
    }

    if (selectionStart) {
      const left = Math.min(selectionStart.viewportX, viewportX)
      const top = Math.min(selectionStart.viewportY, viewportY)
      const width = Math.abs(viewportX - selectionStart.viewportX)
      const height = Math.abs(viewportY - selectionStart.viewportY)

      setSelectionBox({ left, top, width, height })

      const selected = cavities.reduce((indices, cavity, index) => {
        const cavityLeft = cavity.x * zoom + panOffset.x - (cavity.size * zoom) / 2
        const cavityTop = cavity.y * zoom + panOffset.y - (cavity.size * zoom) / 2
        const cavitySize = cavity.size * zoom
        const intersects =
          cavityLeft < left + width &&
          cavityLeft + cavitySize > left &&
          cavityTop < top + height &&
          cavityTop + cavitySize > top

        if (intersects) indices.push(index)
        return indices
      }, [])

      setSelectedCavityIndices(selected)
    }
  }

  const stopActions = () => {
    setDraggingSelection(null)
    setResizingIndex(null)
    setGroupResizeState(null)
    setIsPanning(false)
    setPanStart(null)
    setSelectionStart(null)
    setSelectionBox(null)
  }

  const handleMouseLeave = () => {
    setMousePosition(null)
    stopActions()
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

      if (!ctx) return

      ctx.drawImage(img, 0, 0)

      cavities.forEach((cavity) => {
        const drawX = cavity.x * scaleX
        const drawY = cavity.y * scaleY
        const drawWidth = cavity.size * scaleX
        const drawHeight = cavity.size * scaleY

        ctx.beginPath()

        if (cavity.shape === 'square') {
          ctx.rect(drawX - drawWidth / 2, drawY - drawHeight / 2, drawWidth, drawHeight)
        } else {
          ctx.arc(drawX, drawY, drawWidth / 2, 0, Math.PI * 2)
        }

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

            <div className="toolbar-cluster">
              <span className="toolbar-label">Shape</span>
              <button
                className={cavityShape === 'round' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setCavityShape('round')}
                type="button"
              >
                Round
              </button>
              <button
                className={cavityShape === 'square' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setCavityShape('square')}
                type="button"
              >
                Square
              </button>
            </div>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Layout</span>
              <button
                className={batchLayout === 'paired' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('paired')}
                type="button"
              >
                Pair
              </button>
              <button
                className={batchLayout === 'horizontal' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('horizontal')}
                type="button"
              >
                Horizontal
              </button>
              <button
                className={batchLayout === 'vertical' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('vertical')}
                type="button"
              >
                Vertical
              </button>
            </div>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Count</span>
              <input
                type="number"
                min="1"
                max="200"
                value={batchCount}
                onChange={(e) => setBatchCount(clamp(Number(e.target.value) || 1, 1, 200))}
              />
              <button onClick={addCavities} disabled={!image} type="button">
                Add Batch
              </button>
            </div>

            <button
              className={isRemoveMode ? 'danger-button active' : 'danger-button'}
              onClick={() => setIsRemoveMode((current) => !current)}
              disabled={!image || cavities.length === 0}
              type="button"
            >
              {isRemoveMode ? 'Done Removing' : 'Remove'}
            </button>

            <button onClick={downloadImage} disabled={!image} type="button">
              Download
            </button>
          </div>

          <div className="editor-shell">
            <div
              className={`editor${isPanning ? ' is-panning' : ''}`}
              ref={editorRef}
              style={{
                width: editorWidth,
                height: editorHeight,
              }}
              onMouseDown={(e) => {
                const isImageSurface =
                  e.target === e.currentTarget || e.target instanceof HTMLImageElement

                if (!isImageSurface) return

                if (e.shiftKey) {
                  setSelectedCavityIndices([])
                  setIsPanning(true)
                  setPanStart({
                    pointerX: e.clientX,
                    pointerY: e.clientY,
                    originX: panOffset.x,
                    originY: panOffset.y,
                  })
                  return
                }

                const { viewportX, viewportY } = getPointerPosition(e)
                setSelectedCavityIndices([])
                setSelectionStart({ viewportX, viewportY })
                setSelectionBox({
                  left: viewportX,
                  top: viewportY,
                  width: 0,
                  height: 0,
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
                        `cavity--${cavity.shape}`,
                        isRemoveMode ? 'remove-mode' : '',
                        selectedCavityIndices.includes(index) ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => {
                        e.stopPropagation()

                        if (isRemoveMode) {
                          setSelectedCavityIndices([index])
                          return
                        }

                        const nextSelection = selectedCavityIndices.includes(index)
                          ? selectedCavityIndices
                          : [index]

                        setSelectedCavityIndices(nextSelection)
                        const { mouseX, mouseY } = getPointerPosition(e)

                        setDraggingSelection({
                          pointerX: mouseX,
                          pointerY: mouseY,
                          items: nextSelection.map((selectedIndex) => ({
                            index: selectedIndex,
                            cavity: cavities[selectedIndex],
                          })),
                        })
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
                          type="button"
                        >
                          x
                        </button>
                      )}

                      {!isRemoveMode && activeSingleSelection === index && (
                        <div
                          className="resize-handle"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setSelectedCavityIndices([index])
                            setResizingIndex(index)
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {groupToolbarPosition && (
                <div
                  className="group-toolbar"
                  style={{
                    left: groupToolbarPosition.left,
                    top: groupToolbarPosition.top,
                  }}
                >
                  <button
                    className="group-toolbar__icon"
                    onClick={() => toggleSelectedShape('round')}
                    type="button"
                    title="Round cavities"
                  >
                    ○
                  </button>
                  <button
                    className="group-toolbar__icon"
                    onClick={() => toggleSelectedShape('square')}
                    type="button"
                    title="Square cavities"
                  >
                    □
                  </button>
                  <label className="group-toolbar__control" title="Column spacing">
                    <span>↔</span>
                    <input
                      type="range"
                      min="24"
                      max="180"
                      value={batchSpacing.column}
                      onChange={(e) => updateBatchSpacing('column', e.target.value)}
                    />
                  </label>
                  <label className="group-toolbar__control" title="Row spacing">
                    <span>↕</span>
                    <input
                      type="range"
                      min="24"
                      max="180"
                      value={batchSpacing.row}
                      onChange={(e) => updateBatchSpacing('row', e.target.value)}
                    />
                  </label>
                </div>
              )}

              {selectedGroupBounds && (
                <div
                  className="group-resize-handle"
                  style={{
                    left:
                      (selectedGroupBounds.maxX * zoom + panOffset.x) - 9,
                    top:
                      (selectedGroupBounds.maxY * zoom + panOffset.y) - 9,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const { mouseX, mouseY } = getPointerPosition(e)
                    setGroupResizeState({
                      pointerX: mouseX,
                      pointerY: mouseY,
                      items: selectedCavityIndices.map((index) => ({
                        index,
                        cavity: cavities[index],
                      })),
                    })
                  }}
                />
              )}

              {selectionBox && (
                <div
                  className="selection-box"
                  style={{
                    left: selectionBox.left,
                    top: selectionBox.top,
                    width: selectionBox.width,
                    height: selectionBox.height,
                  }}
                />
              )}
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
                <button onClick={zoomOut} disabled={!image || zoom <= MIN_ZOOM} type="button">
                  -
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={zoomIn} disabled={!image || zoom >= MAX_ZOOM} type="button">
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
