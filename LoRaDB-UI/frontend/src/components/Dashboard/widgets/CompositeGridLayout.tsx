import React from 'react';
import { Responsive as ResponsiveGridLayoutBase, Layout, WidthProvider, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(ResponsiveGridLayoutBase);

interface CompositeGridLayoutProps {
  children: React.ReactElement[];  // Grid items
  layout: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }; // Responsive layouts
  onLayoutChange: (layouts: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => void;
  editMode: boolean;                // Is editing enabled?
  rowHeight?: number;               // Row height in px (default 40)
}

export const CompositeGridLayout: React.FC<CompositeGridLayoutProps> = ({
  children,
  layout,
  onLayoutChange,
  editMode,
  rowHeight = 40,
}) => {
  // Convert our layout format to react-grid-layout Layouts format
  const layouts: Layouts = {
    lg: layout.lg,
    md: layout.md || layout.lg,
    sm: layout.sm || layout.lg,
  };

  // Handle layout change from responsive grid
  const handleLayoutChange = (_currentLayout: Layout[], allLayouts: Layouts) => {
    onLayoutChange({
      lg: allLayouts.lg,
      md: allLayouts.md,
      sm: allLayouts.sm,
    });
  };

  return (
    <div className="composite-grid-container">
      <ResponsiveGridLayout
        className="composite-inner-grid"
        layouts={layouts}
        breakpoints={{ lg: 1024, md: 640, sm: 0 }}
        cols={{ lg: 12, md: 6, sm: 2 }}
        rowHeight={rowHeight}
        onLayoutChange={handleLayoutChange}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".inner-widget-header"
        draggableCancel=".inner-widget-customize-btn"
        resizeHandles={['se']}
        compactType="vertical"
        preventCollision={false}
        margin={[8, 8]}
        containerPadding={[16, 16]}
      >
        {children}
      </ResponsiveGridLayout>
    </div>
  );
};
