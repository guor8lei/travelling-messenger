'use strict';

// Imports dependencies and set up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  request = require('request'),
  app = express().use(bodyParser.json()); // creates express http server
  
// Set up Dialogflow for small talk
const apiai = require('apiai');
const apiaiApp = apiai("c314434cf4a14be28da4fd618cecaab7");

// Set up Yelp Fusion API
const YELP_TOKEN = process.env.YELP_TOKEN // page access token in heroku config
const yelp = require('yelp-fusion');
const yelpClient = yelp.client(YELP_TOKEN);

const PAGE_ACCESS_TOKEN = process.env.FB_MSGR_ACCESS_TOKEN // page access token in heroku config

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('Weber the Webhook is listening on port 1337!'));

// Set reply to index route
app.get('/', function (req, res) {
	res.send("Hello world! I am a Facebook Messenger chatbot created by Raymond Guo.");
});

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {  
 
  let body = req.body;

  // Checks this is an event from a page subscription
  if (body.object === 'page') {

    // Iterates over each entry - there may be multiple if batched
	body.entry.forEach(function(entry) {

	  // Gets the body of the webhook event
	  let webhook_event = entry.messaging[0];
	  //console.log(webhook_event);


	  // Get the sender PSID
	  let sender_psid = webhook_event.sender.id;
	  //console.log('Sender PSID: ' + sender_psid);

	  // Check if the event is a message or postback and
	  // pass the event to the appropriate handler function
	  if (webhook_event.message) {
	    handleMessage(sender_psid, webhook_event.message);        
	  } else if (webhook_event.postback) {
	    handlePostback(sender_psid, webhook_event.postback);
	  }
	  
	});
    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

  // Set verify token
  const VERIFY_TOKEN = "uh-let-me-in-plz";
    
  // Parse the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
  
    // Checks the mode and token sent is correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Responds with the challenge token from the request
      //console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {

  let responseMessenger = {
    "text": `Sorry, I don't know how to respond. Try typing 'help' to get a list of my functionalities.`
  }

  // Check if the message contains text
  if (received_message.text) {    
    
    if (received_message.text.toLowerCase() === "help") {
      responseMessenger = {
        "text": `I'm a Facebook Messenger chatbot created by Raymond. I hope to be a travel advising companion by integrating together APIs that provide weather, hotel, dining, and flight information. For now, let's just have a conversation!`
      }
      callSendAPI(sender_psid, responseMessenger);  
      
    } else {
      let dialogflow = apiaiApp.textRequest(received_message.text, {
        sessionId: 'dialogflow-session' // use any arbitrary id
      });
    
      dialogflow.on('response', (responseDialog) => {
        console.log(responseDialog);
        responseMessenger = { "text": responseDialog.result.fulfillment.speech }
        
        callSendAPI(sender_psid, responseMessenger);  
       });
    
      dialogflow.on('error', (error) => {
        console.log(error);
      });
    
      dialogflow.end();  
    }
    
    // Create the payload for a basic text message
    // response = {
    //   "attachment": {
    //     "type": "template",
    //     "payload": {
    //       "template_type": "button",
    //       "text": `Hey son, I've gotten alittle old and a little hard of hhearing, but I think you said "${received_message.text}". Is that wot u said, brother?`,
    //       "buttons": [
			 // {
    //             "type": "postback",
    //             "title": "Yes ur amazing!",
    //             "payload": "yes",
    //           },
    //           {
    //             "type": "postback",
    //             "title": "No u suk old man!",
    //             "payload": "no",
    //           }
    //         ]
    //       }
    //     }
    //   }
  } else {
  	responseMessenger = {
      "text": `Sorry, I don't know how to respond. Try typing 'help' to get a list of my functionalities.`
    }
    callSendAPI(sender_psid, responseMessenger);    
  }
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  let response;
  
  // Get the payload for the postback
  let payload = received_postback.payload;

  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = { "text": "OoOoOo yes it seems as if ur old man still has the magical touch! Send me another message, won'tcha son!" }
  } else if (payload === 'no') {
    response = { "text": "Oops ma bad. Y doncha try again brother and hopefully old pops will get it right this time!" }
  }
  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  //console.log(request_body);

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      //console.log('Message sent! The sent message contents: ', response);
    } else {
      //console.error("Unable to send message:" + err);
    }
  }); 
}

app.post('/ai', (req, res) => {
  console.log('*** Webhook for yelp api query ***');
  console.log(req.body.result);

  if (req.body.result.action === 'food') {
    console.log('*** food ***');
    let city = req.body.result.parameters['geo-city'];
    
    console.log("about to make yelp api request, city: ", city);
    
    yelpClient.search({
      term:'food',
      location: city
    }).then(response => {
      let msg = "The top restaurants in the city of " + city + " are: " + response.jsonBody.businesses[0].name + ", " + response.jsonBody.businesses[1].name + ", and " + response.jsonBody.businesses[2].name + ".";
      return res.json({
          speech: msg,
          displayText: msg,
          source: 'food'
      });
    }).catch(e => {
      console.log(e);
      let errorMessage = 'I failed to look up the city name.';
        return res.status(400).json({
          status: {
            code: 400,
            errorType: errorMessage
          }
        });
    });
  }
});