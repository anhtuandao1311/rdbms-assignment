const express = require("express");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const bcrypt = require("bcrypt");
const LocalStrategy = require("passport-local").Strategy;
const passport = require("passport");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const port = 3000;

let db = new sqlite3.Database("./restaurant.db", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to the Restaurant Review database.");
});

function initializePassport(passport) {
  const authenticateUser = (username, password, done) => {
    db.get(
      `SELECT * FROM reviewer WHERE username = ?`,
      [username],
      (err, user) => {
        if (err) {
          throw err;
        }

        if (user) {
          bcrypt.compare(password, user.pass, (err, isMatch) => {
            if (err) {
              throw err;
            }

            if (isMatch) {
              return done(null, user);
            } else {
              return done(null, false, {
                message: "Username or password is not correct",
              });
            }
          });
        } else {
          return done(null, false, {
            message: "Username or password is not correct",
          });
        }
      }
    );
  };

  passport.use(
    new LocalStrategy(
      {
        usernameField: "username",
        passwordField: "password",
      },
      authenticateUser
    )
  );
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    db.get(`SELECT * FROM reviewer WHERE id = ?`, [id], (err, user) => {
      if (err) {
        throw err;
      }
      return done(null, user);
    });
  });
}

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

const sessionConfig = {
  name: "session",
  secret: "tuandao",
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};

app.use(session(sessionConfig));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

initializePassport(passport);

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

app.get("/", (req, res) => {
  res.render("home");
});

app.get("/restaurants", (req, res) => {
  db.all("SELECT * FROM restaurant ORDER BY id ASC", (err, restaurants) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/index", { restaurants });
  });
});

app.post("/restaurants", (req, res) => {
  const query = `INSERT INTO restaurant(avg_cost, description, name, open_hours, street_no, street_name, district, city, contact_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    parseInt(req.body.avg_cost),
    req.body.description,
    req.body.name,
    req.body.open_hours,
    req.body.street_no,
    req.body.street_name,
    req.body.district,
    req.body.city,
    req.body.contact_details,
  ];
  db.run(query, params, (err) => {
    if (err) {
      console.log(query);
      throw err;
    }

    req.flash("success", "Created new restaurant!");
    res.redirect(`/restaurants`);
  });
});

app.get("/restaurants/:id/edit", (req, res) => {
  const query = `SELECT * FROM restaurant WHERE id = ?`;
  db.get(query, [parseInt(req.params.id)], (err, restaurant) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/edit", { restaurant });
  });
});

app.put("/restaurants/:id", (req, res) => {
  const query = `UPDATE restaurant SET avg_cost = ?, description = ?, name = ?, open_hours = ?, street_no = ?, street_name = ?, district = ?, city = ?, contact_details = ? WHERE id = ?`;
  const params = [
    parseInt(req.body.avg_cost),
    req.body.description,
    req.body.name,
    req.body.open_hours,
    req.body.street_no,
    req.body.street_name,
    req.body.district,
    req.body.city,
    req.body.contact_details,
    parseInt(req.params.id),
  ];
  db.run(query, params, (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Updated restaurant!");
    res.redirect(`/restaurants/${parseInt(req.params.id)}`);
  });
});

app.delete("/restaurants/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const query = `DELETE FROM restaurant WHERE id = ?`;
  db.run(query, [id], (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully deleted restaurant!");
    res.redirect(`/restaurants`);
  });
});

app.get("/restaurants/search", (req, res) => {
  let restaurantName = "%" + req.query.res_name.toLowerCase() + "%";
  let street = "%" + req.query.street_name.toLowerCase() + "%";
  let district = req.query.district;
  let min_price = req.query.min_price;
  let max_price = req.query.max_price;
  let rating = req.query.rating;

  let query = `SELECT * FROM restaurant WHERE lower(name) LIKE ? AND lower(street_name) LIKE ?`;
  let params = [restaurantName, street];

  if (district !== "Choose District") {
    query += " AND district = ?";
    params.push(district);
  }
  if (min_price && !max_price) {
    query += " AND avg_cost >= ?";
    params.push(parseInt(min_price));
  } else if (!min_price && max_price) {
    query += " AND avg_cost <= ?";
    params.push(parseInt(max_price));
  } else if (min_price && max_price) {
    query += " AND avg_cost <= ? AND avg_cost >= ?";
    params.push(parseInt(max_price), parseInt(min_price));
  }
  if (rating !== "Choose Min Rating") {
    query += " AND avg_rating >= ? ORDER BY avg_rating";
    params.push(parseFloat(rating));
  }

  db.all(query, params, (err, restaurants) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/index", { restaurants });
  });
});

app.get("/restaurants/new", (req, res) => {
  res.render("restaurants/new");
});

app.get("/restaurants/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const query1 = `SELECT * FROM restaurant WHERE id = ?`;
  db.get(query1, [id], (err, restaurant) => {
    if (err) {
      throw err;
    }
    const query2 = `SELECT * FROM review JOIN reviewer ON review.reviewer_id = reviewer.id WHERE restaurant_id = ? ORDER BY review.upload_date DESC`;
    db.all(query2, [id], (err, reviews) => {
      if (err) {
        throw err;
      }
      console.log(reviews);
      res.render("restaurants/show", { restaurant, reviews });
    });
  });
});

app.post("/restaurants/:id/reviews", (req, res) => {
  const id = parseInt(req.params.id);
  const query1 = `SELECT COUNT(reviewer_id) AS count FROM review WHERE restaurant_id = ? AND reviewer_id = ?`;
  db.get(query1, [id, req.user.id], (err, result) => {
    if (err) {
      throw err;
    }
    const times = result.count;
    if (times > 2) {
      req.flash("error", "Cannot create more review for this restaurant!");
      return res.redirect(`/restaurants/${id}`);
    } else {
      const query2 = `INSERT INTO review(stars, review_text, upload_date, upvotes, downvotes, reviewer_id, rflag, restaurant_id, iflag, photo) VALUES (?, ?, date('now'), 0, 0, ?, 't', ?, 'f', '')`;
      const params = [req.body.stars, req.body.review_text, req.user.id, id];
      db.run(query2, params, (err) => {
        if (err) {
          throw err;
        }
        req.flash("success", "Created new review!");
        res.redirect(`/restaurants/${id}`);
      });
    }
  });
});

app.post("/restaurants/:id/menu/:item_id/reviews", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  const query1 = `SELECT COUNT(reviewer_id) AS count FROM review WHERE item_id = ? AND reviewer_id = ?`;
  db.get(query1, [itemId, req.user.id], (err, result) => {
    if (err) {
      throw err;
    }
    const times = result.count;
    if (times > 2) {
      req.flash("error", "Cannot create more review for this item!");
      return res.redirect(`/restaurants/${id}/menu/${itemId}`);
    } else {
      const query2 = `INSERT INTO review(stars, review_text, upload_date, upvotes, downvotes, reviewer_id, rflag, iflag, item_id, photo) VALUES (?, ?, date('now'), 0, 0, ?, 'f', 't', ?, '')`;
      const params = [
        req.body.stars,
        req.body.review_text,
        req.user.id,
        itemId,
      ];
      db.run(query2, params, (err) => {
        if (err) {
          throw err;
        }
        req.flash("success", "Created new review!");
        res.redirect(`/restaurants/${id}/menu/${itemId}`);
      });
    }
  });
});

app.delete("/restaurants/:id/reviews/:review_id", (req, res) => {
  const id = parseInt(req.params.id);
  const reviewId = parseInt(req.params.review_id);
  console.log(reviewId);
  const query = `DELETE FROM review WHERE id = ?`;
  db.run(query, [reviewId], (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully deleted review!");
    res.redirect(`/restaurants/${id}`);
  });
});

app.delete("/restaurants/:id/menu/:item_id/reviews/:review_id", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  const reviewId = parseInt(req.params.review_id);
  const query = `DELETE FROM review WHERE id = ?`;
  db.run(query, [reviewId], (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully deleted review!");
    res.redirect(`/restaurants/${id}/menu/${itemId}`);
  });
});

app.get("/restaurants/:id/menu", (req, res) => {
  const id = parseInt(req.params.id);
  const query = `SELECT * FROM item WHERE restaurant_id = ? ORDER BY id ASC`;
  db.all(query, [id], (err, items) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/menu", { items, id });
  });
});

app.get("/restaurants/:id/menu/new", (req, res) => {
  const id = parseInt(req.params.id);
  res.render("restaurants/newItem", { id });
});

app.post("/restaurants/:id/menu", (req, res) => {
  const id = parseInt(req.params.id);
  const query = `INSERT INTO item(price, category, name, restaurant_id, photo) VALUES (?, ?, ?, ?, '')`;
  const params = [
    parseInt(req.body.price),
    req.body.category,
    req.body.name,
    id,
  ];
  db.run(query, params, (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully created item!");
    res.redirect(`/restaurants/${id}/menu`);
  });
});

app.delete("/restaurants/:id/menu/:item_id", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  const query = `DELETE FROM item WHERE id = ?`;
  db.run(query, [itemId], (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully deleted item!");
    res.redirect(`/restaurants/${id}/menu`);
  });
});

app.get("/restaurants/:id/:review_id", (req, res) => {
  const id = parseInt(req.params.id);
  const review_id = parseInt(req.params.review_id);
  const query1 = `SELECT * FROM review JOIN reviewer ON review.reviewer_id = reviewer.id WHERE review.id = ?`;
  db.get(query1, [review_id], (err, review) => {
    if (err) {
      throw err;
    }
    const query2 = `SELECT comment.reviewer_id AS reviewer_id, comment.id AS cid, comment_text, comment.upload_date AS c_upload_date, username, stars, review_text, upvotes, downvotes, review.upload_date AS r_upload_date FROM comment JOIN reviewer ON comment.reviewer_id = reviewer.id JOIN review ON review.id = comment.review_id AND comment.review_id = ? WHERE rflag = 't' ORDER BY comment.upload_date DESC`;
    db.all(query2, [review_id], (err, comments) => {
      if (err) {
        throw err;
      }
      res.render("restaurants/comment", { review, comments, id, review_id });
    });
  });
});

app.post("/restaurants/:id/:review_id/comments", (req, res) => {
  const id = parseInt(req.params.id);
  const review_id = parseInt(req.params.review_id);
  const query = `INSERT INTO comment(comment_text, upload_date, reviewer_id, review_id) VALUES (?, date('now'), ?, ?)`;
  const params = [req.body.comment_text, req.user.id, review_id];
  db.run(query, params, (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Created new comment!");
    res.redirect(`/restaurants/${id}/${review_id}`);
  });
});

app.post("/restaurants/:id/menu/:item_id/:review_id/comments", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  const review_id = parseInt(req.params.review_id);
  const query = `INSERT INTO comment(comment_text, upload_date, reviewer_id, review_id) VALUES (?, date('now'), ?, ?)`;
  const params = [req.body.comment_text, req.user.id, review_id];
  db.run(query, params, (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Created new comment!");
    res.redirect(`/restaurants/${id}/menu/${itemId}/${review_id}`);
  });
});

app.delete("/restaurants/:id/:review_id/comments/:comment_id", (req, res) => {
  const id = parseInt(req.params.id);
  const comment_id = parseInt(req.params.comment_id);
  let sql = `DELETE FROM comment WHERE id = ?`;

  db.run(sql, [comment_id], (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Successfully deleted comment!");
    res.redirect(`/restaurants/${id}/${req.params.review_id}`);
  });
});

app.delete(
  "/restaurants/:id/menu/:item_id/:review_id/comments/:comment_id",
  (req, res) => {
    const id = parseInt(req.params.id);
    const comment_id = parseInt(req.params.comment_id);
    let sql = `DELETE FROM comment WHERE id = ?`;

    db.run(sql, [comment_id], (err) => {
      if (err) {
        throw err;
      }
      req.flash("success", "Successfully deleted comment!");
      res.redirect(
        `/restaurants/${id}/menu/${req.params.item_id}/${req.params.review_id}`
      );
    });
  }
);

//hereeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
app.get("/restaurants/:id/menu/search", (req, res) => {
  const id = parseInt(req.params.id);
  let itemName = "" + req.query.dish_name;
  let query = `SELECT * FROM item WHERE lower(name) LIKE ? AND restaurant_id = ?`;
  let params = [`%${itemName.toLowerCase()}%`, id];

  let category = "" + req.query.category;
  if (category !== "Choose Category") {
    query += ` AND category = ?`;
    params.push(category);
  }

  if (req.query.min_price && !req.query.max_price) {
    query += ` AND price >= ?`;
    params.push(parseInt(req.query.min_price));
  } else if (!req.query.min_price && req.query.max_price) {
    query += ` AND price <= ?`;
    params.push(parseInt(req.query.max_price));
  } else if (req.query.min_price && req.query.max_price) {
    query += ` AND price <= ? AND price >= ?`;
    params.push(parseInt(req.query.max_price), parseInt(req.query.min_price));
  }

  let rating = "" + req.query.rating;
  if (rating !== "Choose Min Rating") {
    rating = parseFloat(rating);
    query += ` AND avg_rating >= ?`;
    params.push(rating);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/menu", { items: rows, id });
  });
});

app.get("/restaurants/:id/menu/:item_id", (req, res) => {
  const id = parseInt(req.params.id);
  const item_id = parseInt(req.params.item_id);
  let sql = `SELECT * FROM item WHERE id = ? AND restaurant_id = ?`;

  db.get(sql, [item_id, id], (err, item) => {
    if (err) {
      throw err;
    }

    sql = `SELECT review.reviewer_id as reviewer_id, review.id, stars, review_text, upload_date, upvotes, downvotes, reviewer.username FROM review JOIN reviewer ON review.reviewer_id = reviewer.id WHERE item_id = ? ORDER BY upload_date DESC`;
    db.all(sql, [item_id], (err, reviews) => {
      if (err) {
        throw err;
      }

      res.render("restaurants/showMenu", { item, reviews, id });
    });
  });
});

app.get("/restaurants/:id/menu/:item_id/edit", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  let sql = `SELECT * FROM item WHERE id = ?`;

  db.get(sql, [itemId], (err, item) => {
    if (err) {
      throw err;
    }
    res.render("restaurants/editMenu", { item, id });
  });
});

app.put("/restaurants/:id/menu/:item_id", (req, res) => {
  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.item_id);
  let name = "" + req.body.name;
  let index = name.indexOf("'");
  if (index >= 0) {
    name = name.slice(0, index) + "'" + name.slice(index);
  }
  let sql = `UPDATE item SET price = ?, category = ?, name = ? WHERE id = ?`;
  let params = [parseInt(req.body.price), "" + req.body.category, name, itemId];

  db.run(sql, params, (err) => {
    if (err) {
      throw err;
    }
    req.flash("success", "Updated item!");
    res.redirect(`/restaurants/${id}/menu/${itemId}`);
  });
});

app.get("/restaurants/:id/menu/:item_id/:review_id", (req, res) => {
  const id = parseInt(req.params.id);
  const review_id = parseInt(req.params.review_id);
  const item_id = parseInt(req.params.item_id);
  let sql = `SELECT * FROM review JOIN reviewer ON review.reviewer_id = reviewer.id WHERE review.id = ?`;

  db.get(sql, [review_id], (err, review) => {
    if (err) {
      throw err;
    }

    sql = `SELECT comment.reviewer_id as reviewer_id, comment.id as cid, comment_text, comment.upload_date as c_upload_date, username, stars, review_text, upvotes, downvotes, review.upload_date as r_upload_date FROM comment JOIN reviewer ON comment.reviewer_id = reviewer.id JOIN review ON review.id = comment.review_id AND comment.review_id = ? WHERE iflag = 't' ORDER BY comment.upload_date DESC`;
    db.all(sql, [review_id], (err, comments) => {
      if (err) {
        throw err;
      }

      res.render("restaurants/commentMenu", {
        review,
        comments,
        id,
        review_id,
        item_id,
      });
    });
  });
});

app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/restaurants",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.get("/register", (req, res) => {
  res.render("users/register");
});

app.post("/register", async (req, res) => {
  const { email, username, password } = req.body;
  let hashed = await bcrypt.hash(password, 10);
  let sql = `SELECT * FROM reviewer WHERE username = ? OR email = ?`;

  db.get(sql, [username, email], async (err, user) => {
    if (err) {
      throw err;
    }
    if (user) {
      req.flash("error", "Username or email already taken");
      res.redirect("/register");
    } else {
      sql = `INSERT INTO reviewer(id, email, username, pass, join_date) VALUES ((SELECT IFNULL(MAX(id), 0) + 1 FROM reviewer), ?, ?, ?, date('now'))`;
      db.run(sql, [email, username, hashed], (err) => {
        if (err) {
          throw err;
        }
        res.redirect("/login");
      });
    }
  });
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
  });
  req.flash("success", "Goodbye!");
  res.redirect("/restaurants");
});

app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
