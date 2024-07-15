import React, { useState } from 'react';
import axios from 'axios';
import qs from 'qs';
import { Buffer } from 'buffer';
import { FaSpinner } from 'react-icons/fa';

const App = () => {
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) {
            alert('Please select a file to upload');
            return;
        }

        setLoading(true);
        setStatus("Getting auth token...");

        const client_id = '4vSFKFsi1PDXl73UcdgHrhCndZGD1AmrOMMfPpJ7G0LF1MQw';
        const client_secret = 'Sa4zHfWCAll7oRrlCwvrYIV2sgAwHm2DXMxKx2oEhVOSUSAfkh70zDG0vyG4DtA5';

        try {
            // Get auth token
            const authResponse = await axios.post(
                'https://developer.api.autodesk.com/authentication/v1/authenticate',
                qs.stringify({
                    client_id,
                    client_secret,
                    grant_type: 'client_credentials',
                    scope: 'bucket:read bucket:create data:read data:write'
                }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            const authToken = authResponse.data.access_token;

            setStatus("Reading file...");

            // Read file
            const fileBuffer = await file.arrayBuffer();

            setStatus("Uploading file...");

            // Upload file
            const bucketKey = 'nezuko1949';
            const uploadResponse = await axios.put(
                `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${file.name}`,
                fileBuffer,
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/octet-stream'
                    }
                }
            );

            const urn = Buffer.from(uploadResponse.data.objectId).toString('base64');

            setStatus("Translating file...");

            // Translate file
            await axios.post(
                'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
                {
                    input: { urn },
                    output: { formats: [{ type: 'svf', views: ['2d', '3d'] }] }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setStatus("Checking translation status...");

            // Check translation status
            let translationStatus = 'inprogress';
            while (translationStatus === 'inprogress') {
                const statusResponse = await axios.get(
                    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
                    { headers: { 'Authorization': `Bearer ${authToken}` } }
                );
                translationStatus = statusResponse.data.status;
                if (translationStatus === 'failed') {
                    throw new Error('Translation failed');
                }
                if (translationStatus === 'success') {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            setStatus("Getting metadata...");

            // Get metadata GUID
            const metadataResponse = await axios.get(
                `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata`,
                { headers: { 'Authorization': `Bearer ${authToken}` } }
            );
            const guid = metadataResponse.data.data.metadata[0].guid;

            setStatus("Fetching properties...");
            console.log("working 1")

            // Get properties
            const propertiesResponse = await axios.get(
                `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
                { headers: { 'Authorization': `Bearer ${authToken}` } }
            );
            console.log("working 2")

            setStatus("Calculating areas...");
            console.log("working 3")

            // Process properties
            const properties = propertiesResponse.data.data.collection;
            const layerAreas = {};
            properties.forEach((item) => {
                if (item.properties && item.properties['General'] && item.properties['General']['Layer']) {
                    const handle = item.properties['General']['Handle'];
                    const area = parseFloat(item.properties['Geometry']?.Area || 0);
                    layerAreas[handle] = { area, layer: item.properties['General']['Layer'] };
                }
            });
            
            // Given data
            // const compactCarSpace = 12.5; // Compact car space (2.5m x 5m)
            // const aisleWidth = 3.0; // Standard aisle width (3 meters)

            // // Calculate total area for open and close parking
            // const closeParkingLayer = '23a'; // Close parking layer
            // const plotBoundaryLayer = '267'; // Plot boundary layer

            // // Open parking area calculation
            // const openParkingArea = layerAreas[plotBoundaryLayer].area - layerAreas[closeParkingLayer].area;

            // // Close parking area calculation (considering aisle width)
            // const closeParkingArea = layerAreas[closeParkingLayer].area - (numCompactCarsClose * compactCarSpace * aisleWidth);

            // // Calculate number of compact car parking slots
            // const numCompactCarsClose = Math.floor(closeParkingArea / compactCarSpace);
            // const numCompactCarsOpen = Math.floor(openParkingArea / compactCarSpace);

            // console.log("working 4")
            // const result = {
            //     closeParkingArea: closeParkingArea,
            //     openParkingArea: openParkingArea,
            //     numCompactCarsClose: numCompactCarsClose,
            //     numCompactCarsOpen: numCompactCarsOpen
            // };

            
            
            const closeParkingLayer = '23a';
            const plotBoundaryLayer = '267';
            const openParkingArea = layerAreas[plotBoundaryLayer].area - layerAreas[closeParkingLayer].area;
            let unusedSpace = 0;
            for (const handle in layerAreas) {
                if (layerAreas[handle].layer === 'Parking layer' && handle !== closeParkingLayer) {
                    unusedSpace += layerAreas[handle].area;
                }
            }
            const closeParkingArea = layerAreas[closeParkingLayer].area - unusedSpace;
            const compactCarSpace = 12.5;
            const aisleWidth = 3.0; // Standard aisle width (3 meters)
            const numCompactCarsClose = Math.floor(closeParkingArea / compactCarSpace);
            const numCompactCarsOpen = Math.floor(openParkingArea / compactCarSpace);

            setResult({
                closeParkingArea,
                openParkingArea,
                numCompactCarsClose,
                numCompactCarsOpen
            });

            setStatus("Completed");
        } catch (error) {
            console.error("Error:", error.response ? error.response.data : error);
            alert("An error occurred. Check the console for details.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='flex items-center justify-center min-h-screen from-stone-400 via-stone-700 to-stone-900 bg-gradient-to-br'>
            <div className='w-full max-w-lg px-10 py-8 mx-auto bg-white rounded-lg shadow-xl'>
                <div className='max-w-md mx-auto space-y-6'>
                    <h2 className="text-2xl font-bold text-stone-800">Upload your AutoCAD file</h2>
                    <input 
                        type="file" 
                        onChange={handleFileChange} 
                        className="mb-4 w-full px-3 py-2 border rounded text-gray-700" 
                    />
                    <button 
                        onClick={handleUpload} 
                        disabled={loading}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-stone-800 text-white shadow hover:bg-stone-700 h-9 px-4 py-2 ${loading ? 'bg-gray-500' : 'bg-stone-800 hover:bg-stone-700'} transition-all duration-300`}
                    >
                        {loading ? <FaSpinner className="animate-spin inline-block" /> : 'Upload and Process'}
                    </button>
                    {loading && (
                        <div className="mt-4 text-center">
                            <FaSpinner className="animate-spin inline-block text-blue-500" />
                            <p className="text-gray-700 mt-2">{status}</p>
                        </div>
                    )}
                    {result && (
                        <div className="mt-6">
                            <h2 className="text-xl font-bold text-stone-800">Result</h2>
                            <p className="text-gray-700">Close Parking Area: {result.closeParkingArea}</p>
                            <p className="text-gray-700">Open Parking Area: {result.openParkingArea}</p>
                            <p className="text-gray-700">Number of Compact Cars in Close Parking: {result.numCompactCarsClose}</p>
                            <p className="text-gray-700">Number of Compact Cars in Open Parking: {result.numCompactCarsOpen}</p>
                        </div>
                    
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
