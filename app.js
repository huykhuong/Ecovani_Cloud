require('dotenv').config();
const express = require ("express");
const ejs = require ("ejs");
const bodyParser = require ("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const fileUpload = require("express-fileupload");
const path = require("path");
const expressValidator = require("express-validator");
const Emitter = require('events')

const app = express();
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({extended: true}));
app.use(fileUpload());

//Express Validator middleware
app.use(expressValidator({
  errorFormatter: function(param, msg, value){
    var namespace = param.split('.')
    , root = namespace.shift()
    , formParam = root;

  while(namespace.length){
    formParam += '{' + namespace.shift() + '}';
  }
  return {
    param: formParam,
    msg: msg,
    value: value
  };
},
  customValidators: {
    isImage: function(value, filename){
      var extension = (path.extname(filename)).toLowerCase();
      switch (extension){
        case '.jpg':
          return '.jpg';
        case '.jpeg':
          return '.jpeg';
        case '.png':
          return '.png';
        default:
          return false;
      }
    }
  }
}));

//Event Emitter of Socket.io
const eventEmitter = new Emitter()
app.set('eventEmitter', eventEmitter)

//Use passport session
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

//Connect FLash
app.use(flash());

//Global Variable for flash notification
app.use((req,res,next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error = req.flash('error');
  next();
})

// Get Category Model
var Category = require('./models/category');

// Get all categories to pass to indexHeader.ejs
Category.find(function (err, categories) {
    if (err) {
        console.log(err);
    } else {
        app.locals.categories = categories;
    }
});

//Initialize passport session
app.use(passport.initialize());
app.use(passport.session());

//Connect to database
mongoose.connect("mongodb+srv://admin-huykhuong:ruruhaokeai@cluster0.sq3x0.mongodb.net/ecovani", {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

//SCHEMA
var User = require('./models/user');

//Paspport uses
passport.use(User.createStrategy());

passport.use(new GoogleStrategy({
    clientID:     process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://ecovaniapparel.herokuapp.com/auth/google/ecovani",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(request, accessToken, refreshToken, profile, done) {
    console.log(profile);
    User.findOrCreate({ googleId: profile.id , displayName: profile.displayName}, function (err, user) {
      return done(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: "https://ecovaniapparel.herokuapp.com/auth/facebook/ecovani"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate({ facebookId: profile.id, displayName: profile.displayName }, function (err, user) {
      return cb(err, user);
    });
  }
));

//Passport serialize and deserialize
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

//APP.POST()
app.post("/register",function(req,res){
  const { username, password, confirmPassword} = req.body;
  let errors = [];

  if(password !== confirmPassword && (!username || !password || !confirmPassword)){
    errors.push({msg: "Passwords do not match and missing credential"});
  }
  else if(!username || !password || !confirmPassword){
    errors.push({msg: "Please fill out all fields"});
  }
  else if(password !== confirmPassword){
    errors.push({msg: "Passwords do not match"});
  }
  if(errors.length > 0){
    res.render("register", {errors: errors})
  }
  else{
    //Validation passed
  User.register({username: req.body.username}, req.body.password, function(err,user){
    if(err){
      errors.push({msg: 'Username already existed'})
      res.render("register", {errors: errors});
    }
    else{
      passport.authenticate("local")(req,res,function(){
      req.flash('success_msg', 'You can now log in with your newly created account')
      res.redirect("/");
      });
    }
  })
  }
});

//Role-based login
app.post("/login",function(req,res, next){
  let errors = [];
  var temp = null;
  User.findOne({username: req.body.username},function(err,user){
    if(user == null){
      errors.push({msg: 'Username does not exist'})
      res.render("index", {errors: errors});
    }else if(user != null){
      if(user.role === "admin"){
        temp = "/admin"
      }else if(user.role === "staff"){
        temp = "/staff"
      }
      else{
        temp = "/"
      }
    }
  })
  setTimeout(function(){
    passport.authenticate("local", {
      successRedirect: temp,
      failureRedirect: '/login',
      failureFlash: true
    })(req,res,next)
  }, 1000)
});

//Provide the user's info of a logged in session to use globally in all ejs files (view files)
app.get('*', function(req,res,next){
  res.locals.cart = req.session.cart;
  res.locals.user = req.user || null;
  next();
})

//ROUTES SETTINGS
var index = require("./routes/index.js");
app.use('/',index);
var staff = require("./routes/staff.js");
app.use('/staff',staff)
var admin = require("./routes/admin.js");
app.use('/admin',admin)

app.get("/auth/google",
  passport.authenticate('google', {scope: ["profile"]})
);

app.get("/auth/google/ecovani",
  passport.authenticate('google', {failureRedirect: "/"}),
  function(req,res){
    //Successfully authenticated
    res.redirect("/")
  }
)

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/ecovani',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });

//APP.LISTEN()
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

const server = app.listen(port,function(){
  console.log("Server has started successfully");
});

//SOCKET IO CONFIGURATION
const io = require("socket.io")(server)
io.on('connection', function(socket){
  socket.on('join', function(orderId){
    socket.join(orderId)
  })
})

eventEmitter.on('orderUpdated', function(data){
  io.to('order_' + data.id).emit('orderUpdated', data)
});

eventEmitter.on('orderPlaced', function(data){
  io.to('adminArea').emit('orderPlaced', data)
});

eventEmitter.on('orderFailed', function(data){
  io.to('adminArea').emit('orderFailed',data)
});

eventEmitter.on('orderSuccess', function(data){
  io.to('adminArea').emit('orderSuccess', data)
});
