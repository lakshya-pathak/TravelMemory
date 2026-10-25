const tripModel = require('../models/trip.model');

async function tripAdditionController(req, res) {
    console.log("Payload received:", req.body);
    try {
        const tripDetail = new tripModel.Trip({
            tripName: req.body.tripName,
            startDateOfJourney: req.body.startDateOfJourney,
            endDateOfJourney: req.body.endDateOfJourney,
            nameOfHotels: req.body.nameOfHotels,
            placesVisited: req.body.placesVisited,
            totalCost: Number(req.body.totalCost) || 0,
            tripType: req.body.tripType,
            experience: req.body.experience,
            image: req.body.image,
            shortDescription: req.body.shortDescription || "No description",
            featured: req.body.featured
        });
        await tripDetail.save();
        res.status(201).send('Trip added Successfully');
    } catch (error) {
        console.error('DATABASE WRITE ERROR:', error);
        res.status(400).send({ error: error.message });
    }
}

async function getTripDetailsController(req, res) {
    try {
        const docs = await tripModel.Trip.find({});
        res.status(200).send(docs);
    } catch (error) {
        console.error('FETCH ERROR:', error);
        res.status(500).send('SOMETHING WENT WRONG WHILE FETCHING');
    }
}

async function getTripDetailsByIdController(req, res) {
    try {
        const doc = await tripModel.Trip.findById(req.params.id);
        if (!doc) return res.status(404).send('Nothing in database');
        res.status(200).send(doc);
    } catch (error) {
        console.error('FETCH BY ID ERROR:', error);
        res.status(500).send('SOMETHING WENT WRONG');
    }
}

module.exports = { 
    tripAdditionController, 
    getTripDetailsController, 
    getTripDetailsByIdController 
};
