const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve static files from examples directory
app.use('/examples', express.static(path.join(__dirname, 'examples')));

// Serve index.html as the default file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'examples/index.html'));
});

// Handle viewer.html route specifically
app.get('/viewer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'examples/viewer.html'));
});

// Handle all other routes
app.get('*', (req, res, next) => {
    // Try to send the file if it exists
    const filePath = path.join(__dirname, req.path);
    res.sendFile(filePath, (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file not found, try prepending 'examples/'
                const examplePath = path.join(__dirname, 'examples', req.path);
                res.sendFile(examplePath, (err2) => {
                    if (err2) {
                        next(); // Pass to next handler if file still not found
                    }
                });
            } else {
                next(err); // Pass other errors to error handler
            }
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong!');
});

const port = 8080;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 