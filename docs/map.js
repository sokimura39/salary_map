// initialise map
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [139.5, 35.69],
    zoom: 8
});

map.setMaxZoom(16);

let hoveredId = null;

map.on('load', function(){

    // load
    Promise.all([
        d3.json('data/area_salary_simple.geojson'),
        d3.json('data/gadm41_JPN_1.json'),
        d3.json('data/offices_data.geojson'),
        d3.json('data/fac_class.json')
    ]).then(function([area_geom, pref_geom, offices_data, fac_class]){

        // add sources
        map.addSource('areas', {
            type: 'geojson',
            data: area_geom,
            generateId: true
        });

        // add prefectural boundary
        map.addSource('prefs', {
            type: 'geojson',
            data: pref_geom,
        });


        // filter out only the required columns
        // remove embassies as well
        let offices_data_filtered = offices_data.features.filter((feature) =>
            // all the national facilities
            (feature.properties['P28_002'].startsWith('111') || feature.properties['P28_002'].startsWith('112')) && (feature.properties['P28_002'] !== '11161')
        );

        // add offices data
        map.addSource('offices', {
            type: 'geojson',
            data: {
                'type': 'FeatureCollection',
                'features': offices_data_filtered
            }
        });

        console.log(area_geom);

        // add layer
        // add fill layer
        map.addLayer({
            'id': 'areas',
            'type': 'fill',
            'source': 'areas',
            'layout': {
                'fill-sort-key': 10
            },
            'paint': {
                'fill-color': [
                    'interpolate-hcl', ['linear'], ['get', '地域手当_現行'],
                    0, "#ffffff",
                    20, "#0000ff"
                ],
                'fill-opacity': 0.5,
                'fill-outline-color': '#333333'
            }
        });

        // add pref border
        map.addLayer({
            'id': 'prefs',
            'type': 'line',
            'source': 'prefs',
            'layout': {
                'line-sort-key': 11
            },
            'paint': {
                'line-color': '#333333',
                'line-width': 2,
                'line-opacity': 1
            }
        });

        // add border layer - shows selection
        map.addLayer({
            'id': 'areas-border',
            'type': 'line',
            'source': 'areas',
            'layout': {
                'line-sort-key': 12
            },
            'paint': {
                'line-color': '#E75A7C',
                'line-width': 5,
                'line-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    1,
                    0
                ]
            }
        });

        function addOfficeLayer() {
            map.addLayer({
                'id': 'offices',
                'type': 'circle',
                'source': 'offices',
                // 'minzoom': 6,
                'layout': {
                    'circle-sort-key': 1
                },
                'paint': {
                    'circle-radius': 3,
                    'circle-color': '#ffffff',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#888888'
                } 
            });
        }

        addOfficeLayer();

        // add layer on toggle
        document.getElementById('show-1').addEventListener('change', function(){
            // add layer
            if(!map.getLayer('offices')) {
                addOfficeLayer();
            }
        });

        // remove layer on toggle
        document.getElementById('show-2').addEventListener('change', function(){
            // add layer
            if(map.getLayer('offices')) {
                map.removeLayer('offices');
            }
        });

        // add popup for the municipalities
        let popup_areas = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'top',
            offset: 20
        });

        map.on('mousemove', 'areas', (e) => {
            // remove previous
            popup_areas.remove();

            // set hover
            if (hoveredId) {
                map.setFeatureState(
                    {'source': 'areas', id: hoveredId},
                    {hover: false}
                );
            }
            hoveredId = e.features[0].id;
            map.setFeatureState(
                {source: 'areas', id:hoveredId},
                {hover: true}
            );           

            let featureTemp = e.features[0].properties;
            // console.log(featureTemp);
            let id = featureTemp['N03_007'];
            let name = (featureTemp['N03_001'] ?? "") + (featureTemp['N03_003'] ?? "") + (featureTemp['N03_004'] ?? "") + (featureTemp['N03_005'] ?? "");

            let sal_old = featureTemp['地域手当_現行'];
            let sal_new = featureTemp['地域手当_勧告'];
            let sal_change = sal_new - sal_old;

            let description = "<h3>" + name + "</h3><table><tr><td class=\"align-left\">現行地域手当</td><td class=\"align-right\">" + sal_old + "\%</td></tr><tr><td class=\"align-left\">R6勧告支給率</td><td class=\"align-right\">" + sal_new + "\%</td></tr><tr><td class=\"align-left\">変動幅</td><td class=\"align-right\">" + (sal_change<=0?"":"+") + sal_change + "</td></tr></table>"

            popup_areas.setLngLat(e.lngLat).setHTML(description).addTo(map);
        });

        map.on('mouseleave', 'areas', () => {
            popup_areas.remove();

            // reset hovered
            if (hoveredId) {
                map.setFeatureState(
                    {'source': 'areas', id: hoveredId},
                    {hover: false}
                );
            }
        });

        // add popup for the offices
        let popup_offices = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'bottom',
            offset: 20
        });

        map.on('mousemove', 'offices', (e) => {
            // change cursor
            map.getCanvas().style.cursor = 'pointer';

            // get data for selected station
            let coordinates = e.features[0].geometry.coordinates.slice();
            let name = e.features[0].properties['P28_003'];
            let class_id = e.features[0].properties['P28_002'];
            let classification = fac_class[class_id];
            let munic = e.features[0].properties['都道府県'] + (e.features[0].properties['N03_003'] ?? "") + (e.features[0].properties['N03_004'] ?? "") + (e.features[0].properties['N03_005'] ?? "");
            let sal_old = e.features[0].properties['地域手当_現行'];
            let sal_new = e.features[0].properties['地域手当_勧告'];
            let sal_change = sal_new - sal_old;
            let description = "<h3>" + name + "</h3><table><tr><td class=\"align-left\">機関分類</td><td class=\"align-right\">" + classification + "</td></tr><tr><td class=\"align-left\">所在地</td><td class=\"align-right\">" + munic + "</td></tr><!--<tr><td class=\"align-left\">現行地域手当</td><td class=\"align-right\">" + sal_old + "\%</td></tr><tr><td class=\"align-left\">R6勧告支給率</td><td class=\"align-right\">" + sal_new + "\%</td></tr><tr><td class=\"align-left\">変動幅</td><td class=\"align-right\">" + (sal_change<=0?"":"+") + sal_change + "</td></tr>--!></table>"

            // update selection
            popup_offices.setLngLat(coordinates).setHTML(description).addTo(map);
        })

        map.on('mouseleave', 'offices', () => {
            map.getCanvas().style.cursor = '';
            popup_offices.remove();
        });

        // handle the change in the dataset
        document.getElementById('ds-1').addEventListener('change', function(){
            // change background
            map.setPaintProperty('areas', 'fill-color', [
                'interpolate-hcl', ['linear'], ['get', '地域手当_現行'],
                0, "#ffffff",
                20, "#0000ff"
            ]);
            // change legend
            changeColorBar('percentage');

        });
        document.getElementById('ds-2').addEventListener('change', function(){
            // change background
            map.setPaintProperty('areas', 'fill-color', [
                'interpolate-hcl', ['linear'], ['get', '地域手当_勧告'],
                0, "#ffffff",
                20, "#0000ff"
            ]);
            // change legend
            changeColorBar('percentage');

        });
        document.getElementById('ds-3').addEventListener('change', function(){
            // change background
            map.setPaintProperty('areas', 'fill-color', [
                'interpolate-hcl', ['linear'], ['get', '地域手当_変動'],
                -16, "#ff0000",
                0, "#ffffff",
                16, "#00ff00"
            ]);
            // change legend
            changeColorBar('change');
        });

        // change colorbar
        function changeColorBar(type) {
            if (type === 'percentage') {
                // change color by changing class
                document.getElementById('colorbar').className = 'colorbar-percent';
                
                // change the title and labels
                document.getElementById('colorbar-title').innerHTML = "支給割合[%]";
                document.getElementById('label-low').innerHTML = "0";
                document.getElementById('label-middle').innerHTML = "10";
                document.getElementById('label-high').innerHTML = "20";
            } else if (type === 'change') {
                // change color by changing class
                document.getElementById('colorbar').className = 'colorbar-change';
                // change the title and labels
                document.getElementById('colorbar-title').innerHTML = "支給割合変動幅［ポイント］";
                document.getElementById('label-low').innerHTML = "-16";
                document.getElementById('label-middle').innerHTML = "0";
                document.getElementById('label-high').innerHTML = "+16";
            } else {
                // error - do nothing for now
            }
        }
    });
});

