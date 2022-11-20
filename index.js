const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6xivgke.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//verify jwt middleware
function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('unauthorized access');
    } 
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
    try{
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('booking');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');

        // verify admin ..this process after make sure verifyJWT
        const verifyAdmin = async(req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: '' })
            }
            next()
        }
        
        //use aggregate to query multiple collection and then merge data
        app.get('/appointmentOptions', async(req, res)=>{
            const date = req.query.date;
            console.log(date);
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();

            //get the bookings of the provider date
            const bookingQuery = {appointmentDate: date}
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            // find slot available 
            options.forEach(option =>{
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlot = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlot;
            })
            res.send(options);
        })
        
        //api for select doctors speciality name
        app.get('/appointmentSpeciality', async(req, res)=>{
            const query = {}
            const result = await appointmentOptionCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        })

     
        //api for booking data
        app.get('/bookings', verifyJWT, async(req, res)=>{
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if(email !== decodedEmail){
                return res.status(403).send({message: 'forbidden access'});
            }
            
            const query = {email: email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        })


        app.post('/bookings', async(req, res)=>{
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }
            const alreadyBooked =await bookingsCollection.find(query).toArray();

            if(alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`
                return res.send({acknowledged: false, message})
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        //api for conditionally check user alreaday have or not and given jwt token 
        app.get('/jwt', async(req, res)=>{
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
                return res.send({accessToken: token})
            }
            
            res.status(403).send({accessToken: ''});

        })

        //api to get allusers data
        app.get('/users', async(req, res)=>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })

        //api to check perticular id admin or not
        app.get('/users/admin/:email', async(req, res)=>{
            const email = req.params.email;
            const query = {email}
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin'});
        })


        //api to save user data in database
        app.post('/users', async(req, res)=>{
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async(req, res) =>{
            const id = req.params.id;
            const filter = {_id: ObjectId(id)}
            const options = { upsert: true};
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        //api to get doctors data
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
           const query = {}
           const doctors = await doctorsCollection.find(query).toArray();
           res.send(doctors);
        })


        //api to save doctors data in data base
        app.post('/doctors', verifyJWT, verifyAdmin, async(req, res)=>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)
        });

        //api to delete doctors data
        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async(req, res) =>{
            const id = req.params.id;
            const filter = {_id:ObjectId(id)};
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })


        
    }


    finally{

    }
}
// run().catch(console.log);
run().catch((err) => console.error(err));

app.get('/', async(req, res)=>{
    res.send('doctors portal server is running')
})

app.listen(port, ()=> console.log(`Doctors porlat runiing on port: ${port}`))
