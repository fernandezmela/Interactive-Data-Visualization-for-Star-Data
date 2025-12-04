document.addEventListener("DOMContentLoaded", () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create SVG in #plot1
    const svg = d3.select("#plot1")
        .append("svg")
        .attr("width", window.innerWidth)
        .attr("height", window.innerHeight)
        .attr("viewBox", [0, 0, window.innerWidth, window.innerHeight])
        .style("display", "block")       // removes body margin gap
        .style("background", "black")
        .style("position", "fixed")      // keeps it pinned
        .style("top", 0)
        .style("left", 0);

    // Groups for grid, stars, and axes
    const gGrid = svg.append("g");
    const gStars = svg.append("g");  // container for all star layers
    const gx = svg.append("g");
    const gy = svg.append("g");

    // Separate groups for bright, mmedium, and faint stars
    const gStarsBright = gStars.append("g");
    const gStarsMedium = gStars.append("g");
    const gStarsFaint  = gStars.append("g");

    // Scales (RA in hours, Dec in degrees)
    const x = d3.scaleLinear()
        .domain([0, 24])          // RA: 0h to 24h
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([-90, 90])        // Dec: -90° to +90°
        .range([height, 0]);      // flip so +90° is at top

    // Axes
    const xAxis = (g, scaleX) => g
        // was: translate(0, height)
        .attr("transform", `translate(0, ${height - 40})`)  // 40px above bottom
        .call(
            d3.axisBottom(scaleX)
                .ticks(12)
                .tickFormat(d => `${d}h`)
        )
        .call(g => g.select(".domain").attr("display", "none"))
        .call(g => g.selectAll("line").attr("stroke", "#cccccc"))
        .call(g => g.selectAll("text").attr("fill", "#cccccc"));

    const yAxis = (g, scaleY) => g
        // add a translate to push it in from the left
        .attr("transform", `translate(40, 0)`)               // 40px from left edge
        .call(
            d3.axisLeft(scaleY)
                .ticks(9)
                .tickFormat(d => `${d}°`)
        )
        .call(g => g.select(".domain").attr("display", "none"))
        .call(g => g.selectAll("line").attr("stroke", "#cccccc"))
        .call(g => g.selectAll("text").attr("fill", "#cccccc"));

    // Grid lines
    const grid = (g, scaleX, scaleY) => {
        g.attr("stroke", "white")
            .attr("stroke-opacity", 0.1);

        // vertical lines (RA)
        g.selectAll(".x-grid")
            .data(scaleX.ticks(12))
            .join(
                enter => enter.append("line").attr("class", "x-grid"),
                update => update,
                exit => exit.remove()
            )
            .attr("x1", d => 0.5 + scaleX(d))
            .attr("x2", d => 0.5 + scaleX(d))
            .attr("y1", 0)
            .attr("y2", height);

        // horizontal lines (Dec)
        g.selectAll(".y-grid")
            .data(scaleY.ticks(9))
            .join(
                enter => enter.append("line").attr("class", "y-grid"),
                update => update,
                exit => exit.remove()
            )
            .attr("y1", d => 0.5 + scaleY(d))
            .attr("y2", d => 0.5 + scaleY(d))
            .attr("x1", 0)
            .attr("x2", width);
    };

    // Load HYG data
    d3.csv("hyg_v42.csv").then(raw => {
        // Parse & filter rows with valid RA/Dec/mag
        const data = raw
            .map(d => ({
                ra: +d.ra,     // hours
                dec: +d.dec,   // degrees
                mag: +d.mag    // apparent magnitude
            }))
            .filter(d =>
                Number.isFinite(d.ra) &&
                Number.isFinite(d.dec) &&
                Number.isFinite(d.mag)
            );

        // Split by brightness
        const bright = data.filter(d => d.mag <= 5);              // brightest stars
        const medium = data.filter(d => d.mag > 5 && d.mag <= 8);
        const faint  = data.filter(d => d.mag > 8);

        // Scale radius based on magnitude:
        // brighter (smaller mag) = bigger radius
        const rScale = d3.scaleLinear()
            .domain([-1, 12])      // typical magnitudes
            .range([1.5, 0.05])
            .clamp(true);

        // Draw bright stars (always visible)
        gStarsBright
            .attr("fill", "white")
            .attr("stroke", "none")
            .attr("opacity", 1);   // group opacity

        gStarsBright.selectAll("circle")
            .data(bright)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));  // circles default to opacity 1

        // Draw medium stars (hidden initially by group opacity set to 0)
        gStarsMedium
            .attr("fill", "white")
            .attr("stroke", "none")
            .attr("opacity", 0);   // group opacity starts at 0

        gStarsMedium.selectAll("circle")
            .data(medium)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));

        // Draw faint stars (hidden initially by group opacity set to 0)
        gStarsFaint
            .attr("fill", "white")
            .attr("stroke", "none")
            .attr("opacity", 0);   // group opacity starts at 0

        gStarsFaint.selectAll("circle")
            .data(faint)
            .join("circle")
            .attr("cx", d => x(d.ra))
            .attr("cy", d => y(d.dec))
            .attr("r", d => rScale(d.mag));

        // Zoom behavior
        function zoomed({ transform }) {
            const zx = transform.rescaleX(x);
            const zy = transform.rescaleY(y);
            const k = transform.k;

            // Move all stars together
            gStars.attr("transform", transform);

            // Bright stars always visible
            gStarsBright.attr("opacity", 1.0);

            // Medium stars: fade in starting around k ~ 1.5, fully visible by k ~ 4 (k is zoom value)
            const mediumTarget = (() => {
                const t = (k - 1.5) / (4 - 1.5); // 0 at k=1.5, 1 at k=4
                return Math.max(0, Math.min(0.8, t * 0.8));
            })();

            // Faint stars: fade in starting around k ~ 3, fully visible by k ~ 7
            const faintTarget = (() => {
                const t = (k - 3) / (7 - 3); // 0 at k=3, 1 at k=7
                return Math.max(0, Math.min(0.7, t * 0.7));
            })();

            gStarsMedium
                .interrupt()
                .transition()
                .duration(150)
                .attr("opacity", mediumTarget);

            gStarsFaint
                .interrupt()
                .transition()
                .duration(150)
                .attr("opacity", faintTarget);

            // Axes + grid ? (dont like the way the grid looks, commented it out)
            gx.call(xAxis, zx);
            gy.call(yAxis, zy);


            // gGrid.call(grid, zx, zy);
        }

        const zoom = d3.zoom()
            .scaleExtent([1, 50])
            .translateExtent([[0, 0], [width, height]]) // pan limits (can't pan out of bounds)
            .extent([[0, 0], [width, height]])          // viewport for zoom
            .on("zoom", zoomed);

        // Initial view: full sky, only bright stars
        svg.call(zoom)
            .call(zoom.transform, d3.zoomIdentity);

        // Reset zoom button (overlayed on top of graph)
        d3.select("body")
            .append("button")
            .text("Reset zoom")
            .style("position", "fixed")   // sit on top of everything
            .style("top", "20px")         // distance from top of viewport
            .style("right", "20px")       // distance from right of viewport
            .style("padding", "8px 14px")
            .style("background", "rgba(0,0,0,0.7)")
            .style("color", "white")
            .style("border", "1px solid #888")
            .style("border-radius", "4px")
            .style("cursor", "pointer")
            .style("z-index", "10")       // increase x index to make sure it's above the SVG
            .on("click", () => {
                svg.transition()
                    .duration(750)
                    .call(zoom.transform, d3.zoomIdentity);
            });
    }).catch(err => {
        console.error("Error loading hyg_v42.csv:", err);
    });
});