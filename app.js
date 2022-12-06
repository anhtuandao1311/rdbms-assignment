const express = require('express');
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const path = require('path');
const Pool = require('pg').Pool;
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const LocalStrategy = require('passport-local').Strategy;
const passport = require('passport');

const app = express()
const port = 3000

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Restaurant Review',
  password: 'postgres',
  port: 5432
})

function initializePassport(passport){
  const authenticateUser = (username,password,done)=>{
    pool.query(`select * from reviewer where username = '${username}'`,(err,results)=>{
      if (err) {
        throw err;
      }

      console.log(results.rows);

      if(results.rows.length>0){
        const user = results.rows[0];

        bcrypt.compare(password,user.pass,(err,isMatch)=>{
          if (err) {
            throw err;
          }

          if(isMatch){
            return done(null,user);
          }else{
            return done(null,false,{message:"Username or password is not correct"});
          }
        })
      }else{
        return done(null,false,{message:"Username or password is not correct"});
      }
    })
  }

  passport.use(
    new LocalStrategy(
      {
        usernameField:'username',
        passwordField:'password'
      },
      authenticateUser
    )
  );
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    pool.query(`SELECT * FROM reviewer WHERE id = ${id}`, (err, results) => {
      if (err) {
        throw err;
      }
      return done(null, results.rows[0]);
    });
  });
}

app.engine('ejs', ejsMate);
app.set('view engine','ejs')
app.set('views',path.join(__dirname,'views'))

app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));


const sessionConfig = {
  name: 'session',
  secret:'tuandao',
  resave: false,
  saveUninitialized: true,
  cookie: {
      httpOnly: true,
      expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
      maxAge: 1000 * 60 * 60 * 24 * 7
  }
}

app.use(session(sessionConfig));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());


initializePassport(passport);

app.use((req,res,next)=>{
  res.locals.currentUser = req.user;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
})




app.get('/', (req, res) => {
  res.render('home');
})



app.get('/restaurants', (req, res) => {

  pool.query('SELECT * FROM restaurant order by id asc', (err, results) => {
    if (err) {
      throw err;
    }
    const restaurants = results.rows;
    res.render('restaurants/index',{ restaurants })
  })
})

app.post('/restaurants',(req,res)=>{
  const query = `insert into restaurant(id,avg_cost,description,name,open_hours,street_no,street_name,district,city,contact_details) values ((SELECT MAX(id)+1 FROM review),${parseInt(""+req.body.avg_cost)},'${req.body.description}','${req.body.name}','${req.body.open_hours}','${req.body.street_no}','${req.body.street_name}','${req.body.district}','${req.body.city}','${req.body.contact_details}')`;
  pool.query(query, (err, results) => {
    if (err) {
      console.log(query);
      throw err;
    }
    
    req.flash('success', 'Created new restaurant!');
    res.redirect(`/restaurants`);
  })
})

app.get('/restaurants/:id/edit',(req,res)=>{
  pool.query(`SELECT * FROM restaurant where id = ${parseInt(req.params.id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    const restaurant = results.rows[0];
    res.render('restaurants/edit',{ restaurant })
  })
})

app.put('/restaurants/:id',(req,res)=>{
  let name = ""+req.body.name;
  let index = name.indexOf("'");
  if(index>=0){
  name = name.slice(0,index)+"'"+name.slice(index);
}
  const query = `update restaurant set avg_cost=${parseInt(""+req.body.avg_cost)},description='${req.body.description}',name='${name}',open_hours='${req.body.open_hours}',street_no='${req.body.street_no}',street_name='${req.body.street_name}',district='${req.body.district}',city='${req.body.city}',contact_details='${req.body.contact_details}' where id = ${parseInt(req.params.id)}`;
  pool.query(query, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Updated restaurant!');
    res.redirect(`/restaurants/${parseInt(req.params.id)}`);
  })
})

app.delete('/restaurants/:id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from restaurant where id = ${id}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted restaurant!');
    res.redirect(`/restaurants`);
  })
})


app.get('/restaurants/search', (req, res) => {
  let restaurantName = "" + req.query.res_name;
  let street = "" + req.query.street_name;
  let query = `select * from restaurant where lower(name) like '%${restaurantName.toLowerCase()}%' and lower(street_name) like '%${street.toLowerCase()}%'`;
  let district = "" + req.query.district;
  
  if(district !=='Choose District'){
    query = query + ` and district = '${district}'`;
  }
  if(req.query.min_price && !req.query.max_price){
    query += ` and avg_cost >= ${parseInt(req.query.min_price)}`;
  }else if(!req.query.min_price && req.query.max_price){
    query += ` and avg_cost <= ${parseInt(req.query.max_price)}`;
  }else if(req.query.min_price && req.query.max_price){
    query += ` and avg_cost <= ${parseInt(req.query.max_price)} and avg_cost >= ${parseInt(req.query.min_price)}`;  
  }else{

  }
  let rating = "" + req.query.rating;
  if(rating !== 'Choose Min Rating' ){
    rating = parseFloat(rating);
    query = query + ` and avg_rating >= ${rating} order by avg_rating`;
  }
  pool.query(query, (err, results) => {
    if (err) {
      throw err;
    }
    const restaurants = results.rows;
    res.render('restaurants/index',{ restaurants })
  })
})

app.get('/restaurants/new',(req,res)=>{
  res.render('restaurants/new');
})

app.get('/restaurants/:id',(req,res)=>{
  pool.query(`SELECT * FROM restaurant where id=${parseInt(req.params.id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    const restaurant = results.rows[0];
    pool.query(`SELECT review.id,stars,review_text,upload_date,upvotes,downvotes,reviewer.username,review.reviewer_id FROM review join reviewer on review.reviewer_id = reviewer.id where restaurant_id=${parseInt(req.params.id)} order by upload_date desc`, (err, results) => {
      if (err) {
        throw err;
      }
      const reviews = results.rows;
      // for(let i = 0;i<reviews.length;i++){
      //   for(let j = 0;j<reviews.length;j++){
      //     if(reviews[j].id)
      //   }
      // }
      res.render('restaurants/show',{ restaurant, reviews})
    })
  })
  

})

app.post('/restaurants/:id/reviews',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`select count(reviewer_id) from review where restaurant_id=${id} and reviewer_id = ${req.user.id}`, (err, results) => {
    if (err) {
      throw err;
    }
    const times = parseInt(results.rows[0].count);
    if(times>2){
      req.flash('error', 'Cannot create more review for this restaurant!');
      return res.redirect(`/restaurants/${id}`);
    }
    else{
      pool.query(`INSERT INTO review(id,stars,review_text,upload_date,upvotes,downvotes,reviewer_id,rflag,restaurant_id,iflag,photo) VALUES ((SELECT MAX(id)+1 FROM review),${req.body.stars},'${req.body.review_text}',CURRENT_DATE,0,0,${req.user.id},'true',${id},'false','')`, (err, results) => {
        if (err) {
          throw err;
        }
        req.flash('success', 'Created new review!');
        res.redirect(`/restaurants/${id}`);
      })
    }
  })

})

app.post('/restaurants/:id/menu/:item_id/reviews',(req,res)=>{
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  pool.query(`select count(reviewer_id) from review where item_id=${itemId} and reviewer_id = ${req.user.id}`, (err, results) => {
    if (err) {
      throw err;
    }
    const times = parseInt(results.rows[0].count);
    if(times>2){
      req.flash('error', 'Cannot create more review for this item!');
      return res.redirect(`/restaurants/${id}/menu/${req.params.item_id}`);
    }
    else{
      pool.query(`INSERT INTO review(id,stars,review_text,upload_date,upvotes,downvotes,reviewer_id,rflag,iflag,item_id,photo) VALUES ((SELECT MAX(id)+1 FROM review),${req.body.stars},'${req.body.review_text}',CURRENT_DATE,0,0,${req.user.id},'false','true',${req.params.item_id},'')`, (err, results) => {
        if (err) {
          throw err;
        }
        req.flash('success', 'Created new review!');
        res.redirect(`/restaurants/${id}/menu/${req.params.item_id}`);
      })
    }
  })








  
})

app.delete('/restaurants/:id/reviews/:review_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from review where id = ${parseInt(req.params.review_id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted review!');
    res.redirect(`/restaurants/${id}`);
  })
})

app.delete('/restaurants/:id/menu/:item_id/reviews/:review_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from review where id = ${parseInt(req.params.review_id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted review!');
    res.redirect(`/restaurants/${id}/menu/${req.params.item_id}`);
  })
})

app.get('/restaurants/:id/menu',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`select * from item where restaurant_id = ${id} order by id asc`, (err, results) => {
    if (err) {
      throw err;
    }
    const items = results.rows;
    res.render('restaurants/menu',{ items , id})
  })
})

app.get('/restaurants/:id/menu/new',(req,res)=>{
  const id = parseInt(req.params.id);
  res.render('restaurants/newItem',{id});
})

app.post('/restaurants/:id/menu',(req,res)=>{
  const id = parseInt(req.params.id);
  const query = `insert into item(id,price,category,name,restaurant_id,photo) values((SELECT MAX(id)+1 FROM review),${parseInt(""+req.body.price)},'${""+req.body.category}','${""+req.body.name}',${parseInt(id)},'')`;
  pool.query(query, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully created item!');
    res.redirect(`/restaurants/${id}/menu`);
  })
})

app.delete('/restaurants/:id/menu/:item_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from item where id = ${parseInt(req.params.item_id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted item');
    res.redirect(`/restaurants/${id}/menu`);
  })
})

app.get('/restaurants/:id/:review_id',(req,res)=>{
  const id = parseInt(req.params.id);
  const review_id = parseInt(req.params.review_id);
  pool.query(`select * from review join reviewer on review.reviewer_id = reviewer.id where review.id = ${review_id}`,(err,results)=>{
    if(err){
      throw err;
    }

    const review = results.rows[0];
    pool.query(`select comment.reviewer_id as reviewer_id,comment.id as cid,comment_text,comment.upload_date as c_upload_date,username,stars,review_text,upvotes,downvotes,review.upload_date as r_upload_date from comment join reviewer on comment.reviewer_id = reviewer.id join review on review.id = comment.review_id and comment.review_id = ${review_id} where rflag='true' order by comment.upload_date desc;`, (err, results) => {
      if (err) {
        throw err;
      }
      const comments = results.rows;
      res.render('restaurants/comment',{review, comments ,id,review_id})
    })
  })
})

app.post('/restaurants/:id/:review_id/comments',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`INSERT INTO comment(id,comment_text,upload_date,reviewer_id,review_id) VALUES ((SELECT MAX(id)+1 FROM comment),'${req.body.comment_text}',CURRENT_DATE,${req.user.id},${req.params.review_id})`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Created new comment!');
    res.redirect(`/restaurants/${id}/${req.params.review_id}`);
  })
})

app.post('/restaurants/:id/menu/:item_id/:review_id/comments',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`INSERT INTO comment(id,comment_text,upload_date,reviewer_id,review_id) VALUES ((SELECT MAX(id)+1 FROM comment),'${req.body.comment_text}',CURRENT_DATE,${req.user.id},${req.params.review_id})`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Created new comment!');
    res.redirect(`/restaurants/${id}/menu/${req.params.item_id}/${req.params.review_id}`);
  })
})



app.delete('/restaurants/:id/:review_id/comments/:comment_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from comment where id = ${parseInt(req.params.comment_id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted comment!');
    res.redirect(`/restaurants/${id}/${req.params.review_id}`);
  })
})

app.delete('/restaurants/:id/menu/:item_id/:review_id/comments/:comment_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`delete from comment where id = ${parseInt(req.params.comment_id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Successfully deleted comment!');
    res.redirect(`/restaurants/${id}/menu/${req.params.item_id}/${req.params.review_id}`);
  })
})

app.get('/restaurants/:id/menu/search',(req,res)=>{
  const id = parseInt(req.params.id);
  let itemName = "" + req.query.dish_name;
  let query = `select * from item where lower(name) like '%${itemName.toLowerCase()}%' and restaurant_id = ${id}`;
  let category = "" + req.query.category;
  
  if(category !=='Choose Category'){
    query = query + ` and category = '${category}'`;
  }
  if(req.query.min_price && !req.query.max_price){
    query += ` and price >= ${parseInt(req.query.min_price)}`;
  }else if(!req.query.min_price && req.query.max_price){
    query += ` and price <= ${parseInt(req.query.max_price)}`;
  }else if(req.query.min_price && req.query.max_price){
    query += ` and price <= ${parseInt(req.query.max_price)} and price >= ${parseInt(req.query.min_price)}`;  
  }else{

  }
  let rating = "" + req.query.rating;
  if(rating !== 'Choose Min Rating' ){
    rating = parseFloat(rating);
    query = query + ` and avg_rating >= ${rating}`;
  }
  console.log(query);
  pool.query(query, (err, results) => {
    if (err) {
      throw err;
    }
    const items = results.rows;
    console.log(items);
    res.render('restaurants/menu',{ items,id })
  })
})

app.get('/restaurants/:id/menu/:item_id',(req,res)=>{
  const id = parseInt(req.params.id);
  pool.query(`SELECT * FROM item where id=${parseInt(req.params.item_id)} and restaurant_id = ${parseInt(req.params.id)}`, (err, results) => {
    if (err) {
      throw err;
    }
    const item = results.rows[0];
    pool.query(`SELECT review.reviewer_id as reviewer_id,review.id,stars,review_text,upload_date,upvotes,downvotes,reviewer.username FROM review join reviewer on review.reviewer_id = reviewer.id where item_id=${parseInt(req.params.item_id)} order by upload_date desc`, (err, results) => {
      if (err) {
        throw err;
      }
      const reviews = results.rows;
      // for(let i = 0;i<reviews.length;i++){
      //   for(let j = 0;j<reviews.length;j++){
      //     if(reviews[j].id)
      //   }
      // }
      res.render('restaurants/showMenu',{ item, reviews, id})
    })
  })
})

app.get('/restaurants/:id/menu/:item_id/edit',(req,res)=>{
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  pool.query(`select * from item where id = ${itemId}`, (err, results) => {
    if (err) {
      throw err;
    }
    const item = results.rows[0];
    res.render('restaurants/editMenu',{ item , id})
  })

})


app.put('/restaurants/:id/menu/:item_id',(req,res)=>{
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  let name = ""+req.body.name;
  let index = name.indexOf("'");
  if(index>=0){
  name = name.slice(0,index)+"'"+name.slice(index);
}
  const query = `update item set price=${parseInt(""+req.body.price)},category='${""+req.body.category}',name='${name}' where id=${itemId}`;
  pool.query(query, (err, results) => {
    if (err) {
      throw err;
    }
    req.flash('success', 'Updated item!');
    res.redirect(`/restaurants/${id}/menu/${itemId}`);
  })

})

app.get('/restaurants/:id/menu/:item_id/:review_id',(req,res)=>{
  const id = parseInt(req.params.id);
  const review_id = parseInt(req.params.review_id);
  const item_id = parseInt(req.params.item_id);
  pool.query(`select * from review join reviewer on review.reviewer_id = reviewer.id where review.id = ${review_id}`,(err,results)=>{
    if(err){
      throw err;
    }

    const review = results.rows[0];
    pool.query(`select comment.reviewer_id as reviewer_id,comment.id as cid,comment_text,comment.upload_date as c_upload_date,username,stars,review_text,upvotes,downvotes,review.upload_date as r_upload_date from comment join reviewer on comment.reviewer_id = reviewer.id join review on review.id = comment.review_id and comment.review_id = ${review_id} where iflag='true' order by comment.upload_date desc;`, (err, results) => {
      if (err) {
        throw err;
      }
      const comments = results.rows;
      res.render('restaurants/commentMenu',{review, comments,id,review_id,item_id })
    })
  })
})






app.get('/login', (req, res) => {
  res.render('users/login')
})

app.post('/login',passport.authenticate('local',{successRedirect:'/restaurants',failureRedirect:'/login',failureFlash: true})
);


app.get('/register', (req, res) => {
  res.render('users/register')
})

app.post('/register',async (req, res) => {
  const { email, username, password } = req.body;
  let hashed = await bcrypt.hash(password,10);
  pool.query(`select * from reviewer where username= '${username}' or email='${email}'`, (err, results) => {
    if (err) {
      throw err;
    }
    if(results.rows.length>=1){
      req.flash('error', 'Username or email already taken');
      res.redirect('/register');
    }else{
      
      pool.query(`INSERT INTO reviewer(id,email,username,pass,join_date) VALUES ((SELECT MAX(id)+1 FROM reviewer),'${email}','${username}','${hashed}',CURRENT_DATE)`, (err, results) => {
        if (err) {
          throw err;
        }
        res.redirect('/login');
      })
    }
  })
  
})

app.get('/logout',(req,res)=>{
  req.logout((err)=>{
    if(err){ 
        return next(err)
    }});
  req.flash('success',"Goodbye!");
  res.redirect('/restaurants');
})


app.listen(port, () => {
    console.log(`App running on port ${port}.`)
})